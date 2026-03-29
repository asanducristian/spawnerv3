import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('domain_routes', (t) => {
    t.increments('id').primary();

    // The real domain as configured inside the container's nginx (e.g. testwebsite.com)
    t.string('domain', 255).notNullable().unique();

    // URL-safe key used in the *.nuazi.ro subdomain (e.g. testwebsite-com)
    // Derived from domain by replacing dots with dashes — stored so the proxy
    // can do a single indexed lookup without re-encoding at request time.
    t.string('subdomain_key', 255).notNullable().unique().index();

    // Virtual IP of the container that serves this domain
    t.string('virtual_ip', 15).notNullable().index();

    // Game session this route belongs to (for bulk cleanup when a game ends)
    t.string('game_id', 255).nullable().index();

    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('domain_routes');
}
