import Docker from 'dockerode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { StartContainerRequest, StartContainerResponse, UserCredentials } from './types';
import type { ContainerStore } from './container-store';

const ALLOWED_IMAGES = new Set(['game-runtime:latest', 'ubuntu-server:latest']);

const MEMORY_LIMIT = 128 * 1024 * 1024; // 128 MB
const NANO_CPUS = 100_000_000;           // 0.1 CPU
const PIDS_LIMIT = 64;

const PORT_SSH = '22/tcp';
const PORT_HTTP = '80/tcp';

const CONTAINER_CMD = ['/bin/bash', '-lc', '/app/start.sh || true; tail -f /dev/null'];

export class DockerManager {
  private readonly docker: Docker;

  constructor(
    private readonly workerPublicIp: string,
    private readonly store: ContainerStore,
    socketPath?: string,
  ) {
    this.docker = new Docker({ socketPath: socketPath ?? detectDockerSocket() });
  }

  async startContainer(req: StartContainerRequest): Promise<StartContainerResponse> {
    let stage = 'validate';

    try {
      if (!ALLOWED_IMAGES.has(req.image)) {
        throw new Error(`Image not allowed. Allowed: ${[...ALLOWED_IMAGES].join(', ')}`);
      }

      stage = 'prepare-users';
      const users = buildUserCredentials(req.users ?? []);

      stage = 'prepare-env';
      const env = buildEnvVars(req.env, users);

      stage = 'create-container';
      const autoRemove = process.env.DEBUG_KEEP_CONTAINERS !== 'true';
      const container = await this.docker.createContainer({
        Image: req.image,
        Cmd: CONTAINER_CMD,
        Env: env,
        ExposedPorts: { [PORT_SSH]: {}, [PORT_HTTP]: {} },
        HostConfig: {
          AutoRemove: autoRemove,
          Memory: MEMORY_LIMIT,
          NanoCpus: NANO_CPUS,
          PidsLimit: PIDS_LIMIT,
          PortBindings: {
            [PORT_SSH]: [{ HostPort: '0' }],
            [PORT_HTTP]: [{ HostPort: '0' }],
          },
          Privileged: false,
          ReadonlyRootfs: false,
        },
      });

      stage = 'start';
      await container.start();

      stage = 'inspect-ports';
      const ports = await this.waitForPortBindings(container);
      const httpPort = extractPort(ports, PORT_HTTP);
      const sshPort = extractPort(ports, PORT_SSH) ?? 0;

      stage = 'wait-ready';
      await this.waitForHttp(httpPort);

      stage = 'store-mapping';
      const info = await container.inspect();
      const containerId = info.Id;
      const virtualIp = await this.store.assign(containerId, this.workerPublicIp, sshPort, httpPort, req.gameId);

      return { containerId, virtualIp, sshPort, httpPort, users: users.length > 0 ? users : undefined };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[stage:${stage}] ${msg}`);
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop();
      }
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode !== 404) throw err;
      // Container already gone — that's fine
    } finally {
      await this.store.removeByContainerId(containerId);
    }
  }

  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.State.Running;
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404) return false;
      throw err;
    }
  }

  // ── private ─────────────────────────────────────────────────────────────────

  private async waitForPortBindings(container: Docker.Container): Promise<Docker.PortMap> {
    const maxMs = parseInt(process.env.PORT_BINDING_WAIT_MS ?? '15000', 10);
    const pollMs = parseInt(process.env.PORT_BINDING_POLL_MS ?? '200', 10);
    const deadline = Date.now() + maxMs;

    while (Date.now() < deadline) {
      const info = await container.inspect();
      const ports = info.NetworkSettings?.Ports ?? {};

      if (ports[PORT_HTTP]?.[0]?.HostPort) return ports;

      const { Status, Running } = info.State ?? {};
      if (!Running || Status === 'exited' || Status === 'dead') {
        const diag = await this.diagnostics(container);
        throw new Error(`Container exited before ports were bound. ${diag}`);
      }

      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for port bindings after ${maxMs}ms`);
  }

  private async waitForHttp(port: number): Promise<void> {
    const maxMs = parseInt(process.env.CONTAINER_READY_WAIT_MS ?? '30000', 10);
    const deadline = Date.now() + maxMs;

    while (Date.now() < deadline) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(t);
        if (res.status) return;
      } catch {
        // not ready yet
      }
      await sleep(500);
    }
    // Non-fatal: return anyway, the container may still be usable
  }

  private async diagnostics(container: Docker.Container): Promise<string> {
    try {
      const info = await container.inspect();
      const logs = await container.logs({ stdout: true, stderr: true, tail: 20 });
      const logLines = logs.toString('utf-8').trim().split('\n').join(' | ');
      return `status=${info.State?.Status} exitCode=${info.State?.ExitCode} logs=${logLines}`;
    } catch {
      return '(could not collect diagnostics)';
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function detectDockerSocket(): string {
  if (process.platform === 'win32') return '//./pipe/docker_engine';

  const candidates =
    process.platform === 'darwin'
      ? [
          '/var/run/docker.sock',
          path.join(os.homedir(), '.docker/run/docker.sock'),
          path.join(os.homedir(), '.colima/default/docker.sock'),
        ]
      : ['/var/run/docker.sock'];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // keep trying
    }
  }

  return '/var/run/docker.sock';
}

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function buildUserCredentials(users: { username: string }[]): UserCredentials[] {
  if (users.length === 0) return [];

  const creds: UserCredentials[] = users.map((u) => ({
    username: u.username,
    password: generatePassword(),
    isSudoer: false,
  }));

  // Randomly pick one user to be the sudoer
  creds[Math.floor(Math.random() * creds.length)].isSudoer = true;

  return creds;
}

function buildEnvVars(env: Record<string, string>, users: UserCredentials[]): string[] {
  const vars = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  if (users.length > 0) {
    vars.push(`USERS=${JSON.stringify(users)}`);
  }
  return vars;
}

function extractPort(ports: Docker.PortMap, containerPort: string): number | null {
  const binding = ports[containerPort]?.[0]?.HostPort;
  if (!binding) return null;
  return parseInt(binding, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
