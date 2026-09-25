import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from '../infrastructure/database.js';
import { runMigrations } from '../infrastructure/migrations.js';

const pool = createPool(loadConfig().databaseUrl);

try {
  await runMigrations(pool, join(process.cwd(), 'migrations'));
  console.log('Migraciones aplicadas correctamente.');
} finally {
  await pool.end();
}
