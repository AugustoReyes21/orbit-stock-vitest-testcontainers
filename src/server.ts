import { join } from 'node:path';
import { InventoryService } from './application/inventory-service.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './infrastructure/database.js';
import { runMigrations } from './infrastructure/migrations.js';
import { PostgresInventoryRepository } from './infrastructure/postgres-inventory-repository.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

await runMigrations(pool, join(process.cwd(), 'migrations'));
const repository = new PostgresInventoryRepository(pool);
const service = new InventoryService(repository);
const app = await buildApp(service);

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.end();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
