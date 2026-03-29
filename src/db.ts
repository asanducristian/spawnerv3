import knex, { type Knex } from 'knex';
import path from 'path';

export function createDb(): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.DB_PORT ?? '3306', 10),
      user: process.env.DB_USER ?? 'spawner',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ?? 'spawner',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: path.join(__dirname, '..', 'migrations'),
    },
  });
}
