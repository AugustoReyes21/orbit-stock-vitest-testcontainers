import type { Pool, PoolClient } from 'pg';
import type {
  InventoryRepository,
  NewMovementRecord,
  NewProductRecord,
} from '../application/inventory-repository.js';
import type { Product, StockMovement } from '../domain/inventory.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorder_point: number;
  created_at: Date;
}

interface MovementRow {
  id: string;
  product_id: string;
  type: 'IN' | 'OUT';
  quantity: number;
  resulting_quantity: number;
  note: string;
  created_at: Date;
}

export class PostgresInventoryRepository implements InventoryRepository {
  constructor(private readonly pool: Pool) {}

  async createProduct(product: NewProductRecord): Promise<Product> {
    try {
      const result = await this.pool.query<ProductRow>(
        `INSERT INTO products (id, sku, name, quantity, reorder_point)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [product.id, product.sku, product.name, product.quantity, product.reorderPoint],
      );
      return mapProduct(result.rows[0]!);
    } catch (error) {
      if (isPgError(error) && error.code === '23505') {
        throw new ConflictError('Ya existe un componente con ese SKU.', 'DUPLICATE_SKU');
      }
      throw error;
    }
  }

  async findProductById(id: string): Promise<Product | null> {
    const result = await this.pool.query<ProductRow>('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
  }

  async listProducts(): Promise<Product[]> {
    const result = await this.pool.query<ProductRow>('SELECT * FROM products ORDER BY created_at DESC, sku ASC');
    return result.rows.map(mapProduct);
  }

  async registerMovement(movement: NewMovementRecord): Promise<StockMovement> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const product = await this.lockProduct(client, movement.productId);
      if (!product) throw new NotFoundError('El componente solicitado no existe.');

      const delta = movement.type === 'IN' ? movement.quantity : -movement.quantity;
      const resultingQuantity = product.quantity + delta;
      if (resultingQuantity < 0) {
        throw new ConflictError('La salida supera la existencia disponible.', 'INSUFFICIENT_STOCK');
      }
      if (resultingQuantity > 10_000) {
        throw new ConflictError('La existencia total no puede superar 10000.', 'STOCK_LIMIT_EXCEEDED');
      }

      await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [resultingQuantity, movement.productId]);
      const result = await client.query<MovementRow>(
        `INSERT INTO stock_movements
           (id, product_id, type, quantity, resulting_quantity, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [movement.id, movement.productId, movement.type, movement.quantity, resultingQuantity, movement.note],
      );
      await client.query('COMMIT');
      return mapMovement(result.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMovements(productId: string): Promise<StockMovement[]> {
    const result = await this.pool.query<MovementRow>(
      'SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC',
      [productId],
    );
    return result.rows.map(mapMovement);
  }

  private async lockProduct(client: PoolClient, id: string): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id]);
    return result.rows[0] ?? null;
  }
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    reorderPoint: row.reorder_point,
    createdAt: new Date(row.created_at),
  };
}

function mapMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.type,
    quantity: row.quantity,
    resultingQuantity: row.resulting_quantity,
    note: row.note,
    createdAt: new Date(row.created_at),
  };
}

function isPgError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}
