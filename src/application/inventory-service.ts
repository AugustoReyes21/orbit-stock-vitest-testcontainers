import { randomUUID } from 'node:crypto';
import type { InventoryRepository } from './inventory-repository.js';
import {
  MOVEMENT_LIMIT,
  STOCK_LIMIT,
  type CreateProductInput,
  type Product,
  type RegisterMovementInput,
  type StockMovement,
} from '../domain/inventory.js';
import { ConflictError, DomainError, NotFoundError } from '../domain/errors.js';

const SKU_PATTERN = /^ORB-[A-Z0-9]{4,12}$/;

export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  async createProduct(input: CreateProductInput): Promise<Product> {
    const sku = input.sku?.trim().toUpperCase();
    const name = input.name?.trim();

    if (!SKU_PATTERN.test(sku)) {
      throw new DomainError('El SKU debe usar el formato ORB- seguido de 4 a 12 letras o números.', 'INVALID_SKU');
    }
    if (!name || name.length < 3 || name.length > 80) {
      throw new DomainError('El nombre debe contener entre 3 y 80 caracteres.', 'INVALID_NAME');
    }
    this.assertIntegerInRange(input.initialQuantity, 0, STOCK_LIMIT, 'La existencia inicial');
    this.assertIntegerInRange(input.reorderPoint, 0, STOCK_LIMIT, 'El punto de reposición');

    try {
      return await this.repository.createProduct({
        id: randomUUID(),
        sku,
        name,
        quantity: input.initialQuantity,
        reorderPoint: input.reorderPoint,
      });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw error;
    }
  }

  listProducts(): Promise<Product[]> {
    return this.repository.listProducts();
  }

  async getProduct(id: string): Promise<Product> {
    const product = await this.repository.findProductById(id);
    if (!product) throw new NotFoundError('El componente solicitado no existe.');
    return product;
  }

  async registerMovement(productId: string, input: RegisterMovementInput): Promise<StockMovement> {
    if (input.type !== 'IN' && input.type !== 'OUT') {
      throw new DomainError('El tipo de movimiento debe ser IN u OUT.', 'INVALID_MOVEMENT_TYPE');
    }
    this.assertIntegerInRange(input.quantity, 1, MOVEMENT_LIMIT, 'La cantidad del movimiento');
    const note = input.note?.trim();
    if (!note || note.length < 3 || note.length > 120) {
      throw new DomainError('La nota debe contener entre 3 y 120 caracteres.', 'INVALID_NOTE');
    }

    const product = await this.repository.findProductById(productId);
    if (!product) throw new NotFoundError('El componente solicitado no existe.');

    if (input.type === 'OUT' && input.quantity > product.quantity) {
      throw new ConflictError('La salida supera la existencia disponible.', 'INSUFFICIENT_STOCK');
    }
    if (input.type === 'IN' && product.quantity + input.quantity > STOCK_LIMIT) {
      throw new ConflictError(`La existencia total no puede superar ${STOCK_LIMIT}.`, 'STOCK_LIMIT_EXCEEDED');
    }

    return this.repository.registerMovement({
      id: randomUUID(),
      productId,
      type: input.type,
      quantity: input.quantity,
      note,
    });
  }

  async listMovements(productId: string): Promise<StockMovement[]> {
    await this.getProduct(productId);
    return this.repository.listMovements(productId);
  }

  private assertIntegerInRange(value: number, min: number, max: number, label: string): void {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new DomainError(`${label} debe ser un entero entre ${min} y ${max}.`, 'INVALID_QUANTITY');
    }
  }
}
