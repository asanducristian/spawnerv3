import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { createDb } from './db';
import { ContainerStore } from './container-store';
import { DomainStore } from './domain-store';
import { DockerManager } from './docker';
import { registerContainerRoutes } from './routes/containers';
import { registerDomainRoutes } from './routes/domains';
import { registerTerminal } from './terminal';
import { startContainerProxy } from './container-proxy';

async function main() {
  const fastify = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  // ── Database & stores ────────────────────────────────────────────────────────
  const db = createDb();
  const containerStore = new ContainerStore(db);
  const domainStore = new DomainStore(db);

  fastify.log.info('Running migrations…');
  await containerStore.migrate();
  fastify.log.info('Migrations complete');

  // ── Docker ──────────────────────────────────────────────────────────────────
  const workerPublicIp = process.env.WORKER_PUBLIC_IP ?? '127.0.0.1';
  const docker = new DockerManager(workerPublicIp, containerStore, process.env.DOCKER_SOCKET);

  fastify.log.info('Reconciling stale container mappings…');
  await containerStore.reconcile((id) => docker.isContainerRunning(id));
  fastify.log.info('Reconciliation complete');

  // ── Swagger ──────────────────────────────────────────────────────────────────
  await fastify.register(swagger, {
    openapi: {
      info: { title: 'Spawner API', version: '1.0.0' },
      tags: [
        { name: 'containers', description: 'Container lifecycle' },
        { name: 'domains', description: 'Domain → container routing' },
        { name: 'health', description: 'Health check' },
      ],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
        },
      },
      security: [{ apiKey: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ── Plugins ─────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
  });

  await fastify.register(websocket);

  // ── Auth hook ────────────────────────────────────────────────────────────────
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    fastify.log.warn('API_KEY is not set — all requests will be accepted without authentication');
  }

  fastify.addHook('onRequest', async (req, reply) => {
    if (
      req.url === '/health' ||
      req.url.startsWith('/terminal') ||
      req.url.startsWith('/docs')
    ) return;

    if (apiKey && req.headers['x-api-key'] !== apiKey) {
      fastify.log.warn({ url: req.url, ip: req.ip }, 'Rejected request: invalid or missing API key');
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  const baseDomain = process.env.BASE_DOMAIN ?? 'nuazi.ro';

  await registerContainerRoutes(fastify, { docker, store: containerStore });
  await registerDomainRoutes(fastify, { domainStore, containerStore, baseDomain });
  await registerTerminal(fastify, containerStore);

  fastify.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok', service: 'spawner' }));

  // ── Start API server ──────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await fastify.listen({ port, host });

  // ── Start proxy server ────────────────────────────────────────────────────────
  const proxyPort = parseInt(process.env.PROXY_PORT ?? '3002', 10);
  const proxyServer = startContainerProxy(domainStore, containerStore, proxyPort, baseDomain);

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      fastify.log.info(`Received ${sig}, shutting down`);
      proxyServer.close();
      await fastify.close();
      await db.destroy();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Failed to start spawner:', err);
  process.exit(1);
});
