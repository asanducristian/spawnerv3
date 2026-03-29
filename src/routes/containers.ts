import type { FastifyInstance } from 'fastify';
import type { DockerManager } from '../docker';
import type { ContainerStore } from '../container-store';
import type {
  StartContainerRequest,
  StartContainerResponse,
  StopContainerRequest,
} from '../types';

interface Options {
  docker: DockerManager;
  store: ContainerStore;
}

const ALLOWED_IMAGES = ['game-runtime:latest', 'ubuntu-server:latest'];

const userCredentialsSchema = {
  type: 'object',
  properties: {
    username: { type: 'string' },
    password: { type: 'string' },
    isSudoer: { type: 'boolean' },
  },
};

const mappingSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    container_id: { type: 'string' },
    virtual_ip: { type: 'string', examples: ['10.0.42.17'] },
    host: { type: 'string' },
    ssh_port: { type: 'integer' },
    http_port: { type: 'integer' },
    game_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

export async function registerContainerRoutes(
  fastify: FastifyInstance,
  { docker, store }: Options,
): Promise<void> {
  /**
   * POST /containers/start
   */
  fastify.post<{ Body: StartContainerRequest; Reply: StartContainerResponse | { error: string } }>(
    '/containers/start',
    {
      schema: {
        tags: ['containers'],
        summary: 'Start a game container',
        description: 'Spins up a Docker container with resource limits and returns its virtual IP and SSH credentials.',
        body: {
          type: 'object',
          required: ['gameId', 'image', 'env'],
          properties: {
            gameId: {
              type: 'string',
              description: 'Unique game session ID',
              examples: ['game-abc123'],
            },
            image: {
              type: 'string',
              enum: ALLOWED_IMAGES,
              description: 'Docker image to run',
              examples: ['ubuntu-server:latest'],
            },
            users: {
              type: 'array',
              description: 'Users to create inside the container. One will be randomly assigned sudo.',
              items: {
                type: 'object',
                required: ['username'],
                properties: {
                  username: { type: 'string', examples: ['alice'] },
                },
              },
            },
            env: {
              type: 'object',
              description: 'Extra environment variables passed into the container',
              additionalProperties: { type: 'string' },
              examples: [{ GAME_MODE: 'story' }],
            },
          },
        },
        response: {
          200: {
            description: 'Container started successfully',
            type: 'object',
            properties: {
              containerId: { type: 'string', description: 'Full Docker container ID' },
              virtualIp: { type: 'string', description: 'Virtual IP for routing (e.g. 10.0.42.17)' },
              sshPort: { type: 'integer', description: 'Host port bound to container SSH (22)' },
              httpPort: { type: 'integer', description: 'Host port bound to container HTTP (80)' },
              users: {
                type: 'array',
                description: 'Generated credentials (only present if users were requested)',
                items: userCredentialsSchema,
              },
            },
          },
          401: { description: 'Missing or invalid API key', ...errorSchema },
          500: { description: 'Container failed to start', ...errorSchema },
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await docker.startContainer(req.body);
        return reply.code(200).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to start container';
        fastify.log.error({ err, gameId: req.body.gameId }, 'startContainer failed');
        return reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * POST /containers/stop
   */
  fastify.post<{ Body: StopContainerRequest; Reply: { ok: boolean } | { error: string } }>(
    '/containers/stop',
    {
      schema: {
        tags: ['containers'],
        summary: 'Stop a container',
        description: 'Stops a running container and removes its virtual IP mapping. Safe to call on an already-stopped container.',
        body: {
          type: 'object',
          required: ['containerId'],
          properties: {
            containerId: { type: 'string', description: 'Docker container ID to stop' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
          },
          401: { description: 'Missing or invalid API key', ...errorSchema },
          500: { description: 'Stop failed', ...errorSchema },
        },
      },
    },
    async (req, reply) => {
      try {
        await docker.stopContainer(req.body.containerId);
        return reply.code(200).send({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to stop container';
        fastify.log.error({ err, containerId: req.body.containerId }, 'stopContainer failed');
        return reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /containers/:id/status
   */
  fastify.get<{ Params: { id: string }; Reply: { running: boolean } | { error: string } }>(
    '/containers/:id/status',
    {
      schema: {
        tags: ['containers'],
        summary: 'Check container status',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Docker container ID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { running: { type: 'boolean' } },
          },
          401: { description: 'Missing or invalid API key', ...errorSchema },
          500: { description: 'Status check failed', ...errorSchema },
        },
      },
    },
    async (req, reply) => {
      try {
        const running = await docker.isContainerRunning(req.params.id);
        return reply.code(200).send({ running });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to check status';
        fastify.log.error({ err, containerId: req.params.id }, 'isContainerRunning failed');
        return reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /containers
   */
  fastify.get(
    '/containers',
    {
      schema: {
        tags: ['containers'],
        summary: 'List active container mappings',
        description: 'Returns all containers currently tracked in the DB (virtual IP, ports, game ID).',
        response: {
          200: {
            type: 'array',
            items: mappingSchema,
          },
          401: { description: 'Missing or invalid API key', ...errorSchema },
        },
      },
    },
    async (_req, reply) => {
      const mappings = await store.getAll();
      return reply.code(200).send(mappings);
    },
  );
}
