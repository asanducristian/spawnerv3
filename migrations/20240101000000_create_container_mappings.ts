import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('container_mappings', (t) => {
    t.increments('id').primary();

    // Docker container ID (full 64-char hex)
    t.string('container_id', 64).notNullable().unique();

    // Virtual IP assigned to this container (e.g. 10.0.42.17)
    t.string('virtual_ip', 15).notNullable().unique();

    // Public IP/hostname of the spawner worker — used by the backend to reach this container
    t.string('host', 255).notNullable();

    // Ephemeral host ports Docker bound for this container
    t.integer('ssh_port').notNullable();
    t.integer('http_port').notNullable();

    // The game session this container belongs to (nullable — set on start)
    t.string('game_id', 255).nullable().index();

    t.timestamps(true, true); // created_at, updated_at
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('container_mappings');
}
