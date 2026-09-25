import type { Product, StockMovement } from '../domain/inventory.js';

export interface NewProductRecord {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorderPoint: number;
}

export interface NewMovementRecord {
  id: string;
  productId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  note: string;
}

export interface InventoryRepository {
  createProduct(product: NewProductRecord): Promise<Product>;
  findProductById(id: string): Promise<Product | null>;
  listProducts(): Promise<Product[]>;
  registerMovement(movement: NewMovementRecord): Promise<StockMovement>;
  listMovements(productId: string): Promise<StockMovement[]>;
}
