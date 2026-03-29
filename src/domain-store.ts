import type { Knex } from 'knex';

const TABLE = 'domain_routes';

export interface DomainRoute {
  id: number;
  domain: string;
  subdomain_key: string;
  virtual_ip: string;
  game_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Converts a domain to the subdomain key used in *.nuazi.ro
 *   testwebsite.com       → testwebsite-com
 *   api.testwebsite.com   → api-testwebsite-com
 */
export function domainToSubdomainKey(domain: string): string {
  return domain.toLowerCase().replace(/\./g, '-');
}

export class DomainStore {
  constructor(private readonly db: Knex) {}

  /**
   * Register a domain → virtual IP mapping.
   * If the domain already exists, update the virtual IP.
   */
  async register(domain: string, virtualIp: string, gameId?: string): Promise<DomainRoute> {
    const subdomainKey = domainToSubdomainKey(domain);

    await this.db(TABLE)
      .insert({
        domain,
        subdomain_key: subdomainKey,
        virtual_ip: virtualIp,
        game_id: gameId ?? null,
      })
      .onConflict('domain')
      .merge(['virtual_ip', 'game_id', 'updated_at']);

    const row = await this.db<DomainRoute>(TABLE).where('domain', domain).first();
    return row!;
  }

  /**
   * Look up a route by the subdomain key (used by the proxy on every request).
   */
  async lookupBySubdomainKey(subdomainKey: string): Promise<DomainRoute | null> {
    const row = await this.db<DomainRoute>(TABLE)
      .where('subdomain_key', subdomainKey)
      .first();
    return row ?? null;
  }

  /**
   * Look up a route by domain name.
   */
  async lookupByDomain(domain: string): Promise<DomainRoute | null> {
    const row = await this.db<DomainRoute>(TABLE)
      .where('domain', domain)
      .first();
    return row ?? null;
  }

  /**
   * Remove a domain route.
   */
  async remove(domain: string): Promise<void> {
    await this.db(TABLE).where('domain', domain).delete();
  }

  /**
   * Remove all routes for a game session (called when a game ends).
   */
  async removeByGameId(gameId: string): Promise<void> {
    await this.db(TABLE).where('game_id', gameId).delete();
  }

  /**
   * List all routes, optionally filtered by game ID.
   */
  async list(gameId?: string): Promise<DomainRoute[]> {
    const query = this.db<DomainRoute>(TABLE).orderBy('domain');
    if (gameId) query.where('game_id', gameId);
    return query;
  }
}
