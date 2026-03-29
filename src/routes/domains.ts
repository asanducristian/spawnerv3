import type { FastifyInstance } from 'fastify';
import { DomainStore, domainToSubdomainKey } from '../domain-store';
import type { ContainerStore } from '../container-store';

interface Options {
  domainStore: DomainStore;
  containerStore: ContainerStore;
  baseDomain: string;
}

export async function registerDomainRoutes(
  fastify: FastifyInstance,
  { domainStore, containerStore, baseDomain }: Options,
): Promise<void> {
  /**
   * POST /domains
   * Register a domain → container mapping.
   * Call this after a container starts, once for each domain it should serve.
   */
  fastify.post<{
    Body: { domain: string; virtualIp: string; gameId?: string };
  }>(
    '/domains',
    {
      schema: {
        tags: ['domains'],
        summary: 'Register a domain route',
        description:
          'Maps a domain name (e.g. testwebsite.com) to a running container. ' +
          'The domain becomes reachable at {subdomain-key}.nuazi.ro.',
        body: {
          type: 'object',
          required: ['domain', 'virtualIp'],
          properties: {
            domain: { type: 'string', examples: ['testwebsite.com'] },
            virtualIp: { type: 'string', examples: ['10.0.42.17'] },
            gameId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              domain: { type: 'string' },
              subdomainKey: { type: 'string' },
              externalUrl: { type: 'string' },
              virtualIp: { type: 'string' },
            },
          },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const { domain, virtualIp, gameId } = req.body;

      // Verify the virtual IP exists in the container store
      const mapping = await containerStore.lookup(virtualIp);
      if (!mapping) {
        return reply.code(404).send({ error: `No container found for virtual IP ${virtualIp}` });
      }

      try {
        const route = await domainStore.register(domain, virtualIp, gameId);
        return reply.code(200).send({
          domain: route.domain,
          subdomainKey: route.subdomain_key,
          externalUrl: `http://${route.subdomain_key}.${baseDomain}`,
          virtualIp: route.virtual_ip,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to register domain';
        fastify.log.error({ err, domain, virtualIp }, 'register domain failed');
        return reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * DELETE /domains/:domain
   * Remove a domain route (e.g. when a game ends or player removes a domain).
   */
  fastify.delete<{ Params: { domain: string } }>(
    '/domains/:domain',
    {
      schema: {
        tags: ['domains'],
        summary: 'Remove a domain route',
        params: {
          type: 'object',
          required: ['domain'],
          properties: { domain: { type: 'string', examples: ['testwebsite.com'] } },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      try {
        await domainStore.remove(req.params.domain);
        return reply.code(200).send({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to remove domain';
        fastify.log.error({ err, domain: req.params.domain }, 'remove domain failed');
        return reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /domains
   * List all registered domain routes.
   */
  fastify.get<{ Querystring: { gameId?: string } }>(
    '/domains',
    {
      schema: {
        tags: ['domains'],
        summary: 'List domain routes',
        querystring: {
          type: 'object',
          properties: { gameId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                domain: { type: 'string' },
                subdomainKey: { type: 'string' },
                externalUrl: { type: 'string' },
                virtualIp: { type: 'string' },
                gameId: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const routes = await domainStore.list(req.query.gameId);
      return reply.code(200).send(
        routes.map((r) => ({
          domain: r.domain,
          subdomainKey: r.subdomain_key,
          externalUrl: `http://${r.subdomain_key}.${baseDomain}`,
          virtualIp: r.virtual_ip,
          gameId: r.game_id,
        })),
      );
    },
  );

  /**
   * GET /domains/resolve/:subdomain
   * Debug endpoint — show what a subdomain resolves to.
   */
  fastify.get<{ Params: { subdomain: string } }>(
    '/domains/resolve/:subdomain',
    {
      schema: {
        tags: ['domains'],
        summary: 'Resolve a subdomain key',
        description: 'Shows which container a given subdomain key points to. Useful for debugging.',
        params: {
          type: 'object',
          required: ['subdomain'],
          properties: { subdomain: { type: 'string', examples: ['testwebsite-com'] } },
        },
      },
    },
    async (req, reply) => {
      const route = await domainStore.lookupBySubdomainKey(req.params.subdomain);
      if (!route) {
        return reply.code(404).send({ error: `No route for subdomain: ${req.params.subdomain}` });
      }
      const mapping = await containerStore.lookup(route.virtual_ip);
      return reply.code(200).send({
        domain: route.domain,
        virtualIp: route.virtual_ip,
        container: mapping ?? null,
        externalUrl: `http://${route.subdomain_key}.${baseDomain}`,
      });
    },
  );

  /**
   * GET /domains/preview/:domain
   * Show what subdomain key a domain would get before registering it.
   */
  fastify.get<{ Params: { domain: string } }>(
    '/domains/preview/:domain',
    {
      schema: {
        tags: ['domains'],
        summary: 'Preview a domain\'s subdomain key',
        params: {
          type: 'object',
          required: ['domain'],
          properties: { domain: { type: 'string', examples: ['testwebsite.com'] } },
        },
      },
    },
    async (req, reply) => {
      const subdomainKey = domainToSubdomainKey(req.params.domain);
      return reply.code(200).send({
        domain: req.params.domain,
        subdomainKey,
        externalUrl: `http://${subdomainKey}.${baseDomain}`,
      });
    },
  );
}
