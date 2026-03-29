import 'dotenv/config';
import type { Knex } from 'knex';

const connection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  user: process.env.DB_USER ?? 'spawner',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'spawner',
};

const config: Record<string, Knex.Config> = {
  development: {
    client: 'mysql2',
    connection,
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
  },
  production: {
    client: 'mysql2',
    connection,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
  },
};

export default config;
