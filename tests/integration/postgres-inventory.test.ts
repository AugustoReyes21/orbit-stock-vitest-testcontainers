import { join } from 'node:path';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InventoryService } from '../../src/application/inventory-service.js';
import { runMigrations } from '../../src/infrastructure/migrations.js';
import { PostgresInventoryRepository } from '../../src/infrastructure/postgres-inventory-repository.js';

describe('PostgresInventoryRepository con PostgreSQL temporal', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let service: InventoryService;

  beforeAll(async () => {
    // Arrange global: la conexión proviene exclusivamente del contenedor temporal.
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('orbit_test')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool, join(process.cwd(), 'migrations'));
    service = new InventoryService(new PostgresInventoryRepository(pool));
  });

  beforeEach(async () => {
    // Cada caso inicia sin datos, pero reutiliza el contenedor para mantener la suite rápida.
    await pool.query('TRUNCATE TABLE stock_movements, products CASCADE');
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('persiste un producto y lo recupera mediante el repositorio real', async () => {
    // Arrange
    const input = { sku: 'ORB-DB01', name: 'Nodo de telemetría', initialQuantity: 12, reorderPoint: 3 };

    // Act
    const created = await service.createProduct(input);
    const recovered = await service.getProduct(created.id);

    // Assert
    expect(recovered).toMatchObject({ sku: 'ORB-DB01', name: 'Nodo de telemetría', quantity: 12 });
    expect(recovered.id).toBe(created.id);
  });

  it('guarda el movimiento y actualiza la existencia dentro de una transacción', async () => {
    // Arrange
    const product = await service.createProduct({ sku: 'ORB-DB02', name: 'Acoplador fotónico', initialQuantity: 10, reorderPoint: 2 });

    // Act
    const movement = await service.registerMovement(product.id, { type: 'OUT', quantity: 4, note: 'Asignación a prototipo' });
    const recovered = await service.getProduct(product.id);
    const history = await service.listMovements(product.id);

    // Assert
    expect(movement.resultingQuantity).toBe(6);
    expect(recovered.quantity).toBe(6);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: 'OUT', quantity: 4, resultingQuantity: 6 });
  });

  it('hace cumplir la unicidad del SKU en PostgreSQL', async () => {
    // Arrange
    const first = { sku: 'ORB-UNIQ', name: 'Primer módulo', initialQuantity: 2, reorderPoint: 1 };
    const duplicate = { ...first, name: 'Módulo duplicado' };
    await service.createProduct(first);

    // Act y Assert
    await expect(service.createProduct(duplicate)).rejects.toMatchObject({ code: 'DUPLICATE_SKU' });
    const count = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM products');
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it('conserva la integridad al rechazar una salida sin existencias suficientes', async () => {
    // Arrange
    const product = await service.createProduct({ sku: 'ORB-SAFE', name: 'Fusible inteligente', initialQuantity: 3, reorderPoint: 1 });

    // Act y Assert
    await expect(
      service.registerMovement(product.id, { type: 'OUT', quantity: 4, note: 'Demanda imposible' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect((await service.getProduct(product.id)).quantity).toBe(3);
    expect(await service.listMovements(product.id)).toHaveLength(0);
  });
});
