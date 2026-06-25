// src/db/database.js
// Server-side SQLite via knex (pure JS, no native compilation needed)

const knex = require('knex');
const path = require('path');
const fs   = require('fs');

const DB_DIR  = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'auth.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = knex({
  client: 'sqlite3',
  connection: { filename: DB_PATH },
  useNullAsDefault: true,
});

// ── Schema bootstrap ──────────────────────────────────────────────────────────

async function bootstrap() {

  // developers
  if (!(await db.schema.hasTable('developers'))) {
    await db.schema.createTable('developers', t => {
      t.string('id').primary();
      t.string('email').unique().notNullable();
      t.string('password_hash').notNullable();
      t.string('name').notNullable();
      t.integer('created_at').notNullable();
      t.integer('updated_at').notNullable();
    });
  }

  // projects
  if (!(await db.schema.hasTable('projects'))) {
    await db.schema.createTable('projects', t => {
      t.string('id').primary();
      t.string('developer_id').notNullable().references('id').inTable('developers');
      t.string('name').notNullable();
      t.integer('created_at').notNullable();
      t.integer('updated_at').notNullable();
    });
  }

  // api_keys
  if (!(await db.schema.hasTable('api_keys'))) {
    await db.schema.createTable('api_keys', t => {
      t.string('id').primary();
      t.string('project_id').notNullable().references('id').inTable('projects');
      t.string('app_id').unique().notNullable();
      t.string('app_secret').notNullable();
      t.integer('is_active').notNullable().defaultTo(1);
      t.integer('created_at').notNullable();
      t.integer('updated_at').notNullable();
    });
  }

  // refresh_tokens
  if (!(await db.schema.hasTable('refresh_tokens'))) {
    await db.schema.createTable('refresh_tokens', t => {
      t.string('id').primary();
      t.string('api_key_id').notNullable().references('id').inTable('api_keys');
      t.string('token_hash').notNullable();
      t.integer('expires_at').notNullable();
      t.integer('revoked').notNullable().defaultTo(0);
      t.integer('created_at').notNullable();
    });
  }

  console.log('Database ready:', DB_PATH);
}

module.exports = { db, bootstrap };
