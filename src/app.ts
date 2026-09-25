import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { InventoryService } from './application/inventory-service.js';
import { DomainError } from './domain/errors.js';

export async function buildApp(service: InventoryService): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'public'),
    prefix: '/',
  });

  app.get('/health', async () => ({ status: 'ok', system: 'orbit-stock' }));

  app.get('/api/products', async () => service.listProducts());

  app.get<{ Params: { id: string } }>('/api/products/:id', async (request) =>
    service.getProduct(request.params.id),
  );

  app.post<{
    Body: { sku: string; name: string; initialQuantity: number; reorderPoint: number };
  }>('/api/products', { schema: { body: { type: 'object', required: ['sku', 'name', 'initialQuantity', 'reorderPoint'] } } }, async (request, reply) => {
    const product = await service.createProduct(request.body);
    return reply.code(201).send(product);
  });

  app.post<{
    Params: { id: string };
    Body: { type: 'IN' | 'OUT'; quantity: number; note: string };
  }>('/api/products/:id/movements', { schema: { body: { type: 'object', required: ['type', 'quantity', 'note'] } } }, async (request, reply) => {
    const movement = await service.registerMovement(request.params.id, request.body);
    return reply.code(201).send(movement);
  });

  app.get<{ Params: { id: string } }>('/api/products/:id/movements', async (request) =>
    service.listMovements(request.params.id),
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'La solicitud no contiene todos los campos requeridos.' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'No fue posible completar la operación.' });
  });

  return app;
}
