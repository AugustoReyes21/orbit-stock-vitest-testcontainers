import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryService } from '../../src/application/inventory-service.js';
import type {
  InventoryRepository,
  NewMovementRecord,
  NewProductRecord,
} from '../../src/application/inventory-repository.js';
import type { Product, StockMovement } from '../../src/domain/inventory.js';
import { ConflictError } from '../../src/domain/errors.js';

class InMemoryInventoryRepository implements InventoryRepository {
  products: Product[] = [];
  movements: StockMovement[] = [];

  async createProduct(record: NewProductRecord): Promise<Product> {
    if (this.products.some((product) => product.sku === record.sku)) {
      throw new ConflictError('Ya existe un componente con ese SKU.', 'DUPLICATE_SKU');
    }
    const product = { ...record, createdAt: new Date() };
    this.products.push(product);
    return product;
  }

  async findProductById(id: string): Promise<Product | null> {
    return this.products.find((product) => product.id === id) ?? null;
  }

  async listProducts(): Promise<Product[]> {
    return [...this.products];
  }

  async registerMovement(record: NewMovementRecord): Promise<StockMovement> {
    const product = this.products.find((item) => item.id === record.productId)!;
    product.quantity += record.type === 'IN' ? record.quantity : -record.quantity;
    const movement = { ...record, resultingQuantity: product.quantity, createdAt: new Date() };
    this.movements.push(movement);
    return movement;
  }

  async listMovements(productId: string): Promise<StockMovement[]> {
    return this.movements.filter((movement) => movement.productId === productId);
  }
}

describe('InventoryService', () => {
  let repository: InMemoryInventoryRepository;
  let service: InventoryService;

  beforeEach(() => {
    // Arrange común: un repositorio rápido, sin PostgreSQL ni servicios externos.
    repository = new InMemoryInventoryRepository();
    service = new InventoryService(repository);
  });

  it('registra un componente válido normalizando su SKU', async () => {
    // Arrange
    const input = { sku: 'orb-a12b', name: 'Sensor cuántico', initialQuantity: 20, reorderPoint: 5 };

    // Act
    const product = await service.createProduct(input);

    // Assert
    expect(product).toMatchObject({ sku: 'ORB-A12B', name: 'Sensor cuántico', quantity: 20, reorderPoint: 5 });
    expect(repository.products).toHaveLength(1);
  });

  it.each([0, 10_000])('acepta %i como límite válido de existencia inicial', async (initialQuantity) => {
    // Arrange
    const input = { sku: `ORB-LIM${initialQuantity === 0 ? '0' : 'X'}`, name: 'Módulo límite', initialQuantity, reorderPoint: 0 };

    // Act
    const product = await service.createProduct(input);

    // Assert
    expect(product.quantity).toBe(initialQuantity);
  });

  it('rechaza un SKU que no cumple el formato de negocio', async () => {
    // Arrange
    const input = { sku: 'ABC-1', name: 'Sensor inválido', initialQuantity: 10, reorderPoint: 2 };

    // Act y Assert
    await expect(service.createProduct(input)).rejects.toMatchObject({ code: 'INVALID_SKU' });
    expect(repository.products).toHaveLength(0);
  });

  it('permite retirar exactamente toda la existencia', async () => {
    // Arrange
    const product = await service.createProduct({ sku: 'ORB-EDGE', name: 'Celda de energía', initialQuantity: 8, reorderPoint: 2 });

    // Act
    const movement = await service.registerMovement(product.id, { type: 'OUT', quantity: 8, note: 'Instalación en campo' });

    // Assert
    expect(movement.resultingQuantity).toBe(0);
    expect(repository.products[0]?.quantity).toBe(0);
  });

  it('rechaza una salida mayor que la existencia sin modificar el producto', async () => {
    // Arrange
    const product = await service.createProduct({ sku: 'ORB-LOW1', name: 'Microcontrolador', initialQuantity: 4, reorderPoint: 2 });

    // Act y Assert
    await expect(
      service.registerMovement(product.id, { type: 'OUT', quantity: 5, note: 'Solicitud de laboratorio' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(repository.products[0]?.quantity).toBe(4);
    expect(repository.movements).toHaveLength(0);
  });

  it.each([0, 1001, 1.5])('rechaza la cantidad de movimiento inválida %s', async (quantity) => {
    // Arrange
    const product = await service.createProduct({ sku: 'ORB-QTY1', name: 'Placa óptica', initialQuantity: 20, reorderPoint: 5 });

    // Act y Assert
    await expect(
      service.registerMovement(product.id, { type: 'IN', quantity, note: 'Recepción validada' }),
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
  });
});
