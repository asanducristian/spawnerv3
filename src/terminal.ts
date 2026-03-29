import type { FastifyInstance } from 'fastify';
import { Client as SshClient } from 'ssh2';
import type { ContainerStore } from './container-store';

/**
 * WebSocket endpoint: proxies the browser terminal to an SSH session inside a container.
 *
 * Query params:
 *   ip       — virtual IP returned by /containers/start
 *   username — SSH username inside the container
 *   password — SSH password for that user
 *
 * The client can send either raw bytes (terminal input) or a JSON resize message:
 *   { type: 'resize', cols: number, rows: number }
 */
export async function registerTerminal(fastify: FastifyInstance, store: ContainerStore): Promise<void> {
  fastify.get('/terminal', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const virtualIp = url.searchParams.get('ip');
    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');

    if (!virtualIp || !username || !password) {
      socket.send('ERROR: Missing required query params: ip, username, password\r\n');
      socket.close();
      return;
    }

    // Resolve virtual IP → actual SSH host:port asynchronously, then connect
    store.lookup(virtualIp).then((mapping) => {
      if (!mapping) {
        socket.send(`ERROR: Unknown virtual IP: ${virtualIp}\r\n`);
        socket.close();
        return;
      }

      const { host, sshPort } = mapping;
      const ssh = new SshClient();

      ssh.on('ready', () => {
        fastify.log.info({ virtualIp, host, sshPort, username }, 'SSH session opened');

        ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
          if (err) {
            socket.send(`ERROR: ${err.message}\r\n`);
            socket.close();
            return;
          }

          // SSH → browser
          stream.on('data', (data: Buffer) => {
            try { socket.send(data); } catch { /* socket already closed */ }
          });
          stream.stderr.on('data', (data: Buffer) => {
            try { socket.send(data); } catch { /* socket already closed */ }
          });
          stream.on('close', () => {
            fastify.log.info({ virtualIp, username }, 'SSH stream closed');
            socket.close();
          });

          // Browser → SSH
          socket.on('message', (msg: Buffer) => {
            const raw = msg.toString();
            try {
              const parsed = JSON.parse(raw);
              if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                stream.setWindow(parsed.rows, parsed.cols, 0, 0);
                return;
              }
            } catch {
              // Not JSON — treat as terminal input
            }
            stream.write(raw);
          });

          socket.on('close', () => {
            fastify.log.info({ virtualIp, username }, 'WebSocket closed');
            stream.end();
            ssh.end();
          });

          socket.on('error', (err: Error) => {
            fastify.log.error({ err, virtualIp }, 'WebSocket error');
            stream.end();
            ssh.end();
          });
        });
      });

      ssh.on('error', (err) => {
        fastify.log.error({ err, host, sshPort, username }, 'SSH connection error');
        socket.send(`\r\nSSH Error: ${err.message}\r\n`);
        socket.close();
      });

      ssh.connect({
        host,
        port: sshPort,
        username,
        password,
        readyTimeout: 10_000,
        keepaliveInterval: 10_000,
      });
    }).catch((err: Error) => {
      fastify.log.error({ err }, 'Failed to resolve container mapping for terminal');
      socket.send(`ERROR: Internal error\r\n`);
      socket.close();
    });
  });
}
