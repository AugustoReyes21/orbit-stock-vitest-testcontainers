export const STOCK_LIMIT = 10_000;
export const MOVEMENT_LIMIT = 1_000;

export type MovementType = 'IN' | 'OUT';

export interface Product {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorderPoint: number;
  createdAt: Date;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  resultingQuantity: number;
  note: string;
  createdAt: Date;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  initialQuantity: number;
  reorderPoint: number;
}

export interface RegisterMovementInput {
  type: MovementType;
  quantity: number;
  note: string;
}
