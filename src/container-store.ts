import type { Knex } from 'knex';
import type { ContainerMapping } from './types';

const TABLE = 'container_mappings';
const IP_PREFIX = '10.0';

/**
 * DB-backed store for container → virtual IP mappings.
 * Replaces the old in-memory + JSON file ip-mapper.
 */
export class ContainerStore {
  constructor(private readonly db: Knex) {}

  /**
   * Run pending migrations on startup.
   */
  async migrate(): Promise<void> {
    await this.db.migrate.latest();
  }

  /**
   * On restart, remove any mappings whose containers are no longer running.
   * Call this after Docker is available, passing a check function.
   */
  async reconcile(isRunning: (containerId: string) => Promise<boolean>): Promise<void> {
    const all = await this.db<ContainerMapping>(TABLE).select('container_id', 'virtual_ip');
    for (const row of all) {
      const alive = await isRunning(row.container_id);
      if (!alive) {
        await this.db(TABLE).where('container_id', row.container_id).delete();
      }
    }
  }

  /**
   * Assign a virtual IP to a container and persist it.
   */
  async assign(
    containerId: string,
    host: string,
    sshPort: number,
    httpPort: number,
    gameId?: string,
  ): Promise<string> {
    const virtualIp = await this.generateUniqueIp();

    await this.db(TABLE).insert({
      container_id: containerId,
      virtual_ip: virtualIp,
      host,
      ssh_port: sshPort,
      http_port: httpPort,
      game_id: gameId ?? null,
    });

    return virtualIp;
  }

  /**
   * Look up SSH/HTTP endpoints by virtual IP.
   */
  async lookup(virtualIp: string): Promise<{ host: string; sshPort: number; httpPort: number } | null> {
    const row = await this.db<ContainerMapping>(TABLE)
      .where('virtual_ip', virtualIp)
      .first();

    if (!row) return null;

    return { host: row.host, sshPort: row.ssh_port, httpPort: row.http_port };
  }

  /**
   * Get the full mapping record by container ID.
   */
  async getByContainerId(containerId: string): Promise<ContainerMapping | null> {
    const row = await this.db<ContainerMapping>(TABLE)
      .where('container_id', containerId)
      .first();
    return row ?? null;
  }

  /**
   * Remove a mapping when a container is stopped.
   */
  async removeByContainerId(containerId: string): Promise<void> {
    await this.db(TABLE).where('container_id', containerId).delete();
  }

  /**
   * List all active mappings.
   */
  async getAll(): Promise<ContainerMapping[]> {
    return this.db<ContainerMapping>(TABLE).select('*').orderBy('created_at', 'desc');
  }

  private async generateUniqueIp(): Promise<string> {
    for (let i = 0; i < 1000; i++) {
      const octet3 = Math.floor(Math.random() * 256);
      const octet4 = Math.floor(Math.random() * 256);
      const ip = `${IP_PREFIX}.${octet3}.${octet4}`;

      const existing = await this.db(TABLE).where('virtual_ip', ip).first();
      if (!existing) return ip;
    }
    throw new Error('Could not generate a unique virtual IP after 1000 attempts');
  }
}
