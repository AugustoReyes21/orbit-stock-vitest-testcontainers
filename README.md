# Orbit Stock

Aplicación web de inventario transaccional construida con TypeScript, Fastify y PostgreSQL. Incluye pruebas unitarias con Vitest y pruebas de integración contra PostgreSQL temporal administrado por Testcontainers.

![CI](https://github.com/AugustoReyes21/orbit-stock-vitest-testcontainers/actions/workflows/ci.yml/badge.svg)

## Problema y flujo funcional

Orbit Stock administra componentes tecnológicos de un laboratorio. Un operador puede:

1. Registrar un componente con SKU, nombre, existencia inicial y punto de reposición.
2. Consultar el inventario y visualizar componentes con existencia baja.
3. Registrar entradas y salidas de existencias.
4. Consultar el historial de movimientos mediante la API.

Una salida actualiza el producto y crea su movimiento dentro de una única transacción PostgreSQL. El repositorio bloquea la fila con `SELECT ... FOR UPDATE`, por lo que dos operaciones concurrentes no pueden dejar una existencia negativa.

## Reglas de negocio

- El SKU usa el formato `ORB-` seguido por 4 a 12 letras mayúsculas o números y es único.
- El nombre contiene entre 3 y 80 caracteres.
- La existencia se mantiene entre 0 y 10 000 unidades.
- Cada movimiento contiene entre 1 y 1 000 unidades enteras.
- No se acepta una salida superior a la existencia disponible.
- Una entrada no puede elevar la existencia por encima de 10 000.
- Cada movimiento requiere una nota de 3 a 120 caracteres.
- El punto de reposición admite valores entre 0 y 10 000; la interfaz marca el componente cuando `existencia <= punto de reposición`.

Las reglas están en `src/application/inventory-service.ts`; las restricciones equivalentes importantes también existen en PostgreSQL como defensa de integridad.

## Arquitectura

```text
public/ (interfaz web)
        │ HTTP
src/app.ts (rutas Fastify)
        │
InventoryService (reglas de negocio)
        │ InventoryRepository (puerto)
        ├── InMemoryInventoryRepository  ← solo pruebas unitarias
        └── PostgresInventoryRepository  ← ejecución e integración reales
                    │
               PostgreSQL
```

La lógica de negocio depende de la interfaz `InventoryRepository`, no de `pg`. Así, la suite unitaria comprueba reglas sin base de datos ni servicios externos, mientras la suite de integración ejecuta el adaptador PostgreSQL real.

## Requisitos

- Node.js 20 o superior (CI utiliza Node.js 22).
- Docker Desktop o un motor Docker compatible.
- npm.

## Ejecución local

```bash
npm ci
docker compose up -d
npm run db:migrate
npm start
```

Abra <http://localhost:3000>. La configuración predeterminada coincide con `docker-compose.yml`. Si necesita otra conexión, copie `.env.example` como `.env` y modifique `DATABASE_URL`.

Para desarrollo con recarga automática:

```bash
npm run dev
```

Para detener la base local:

```bash
docker compose down
```

## API

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Estado del servicio |
| `GET` | `/api/products` | Consultar inventario |
| `POST` | `/api/products` | Registrar componente |
| `GET` | `/api/products/:id` | Consultar un componente |
| `POST` | `/api/products/:id/movements` | Registrar entrada o salida |
| `GET` | `/api/products/:id/movements` | Consultar movimientos |

Ejemplo de registro:

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ORB-A12B","name":"Sensor cuántico","initialQuantity":20,"reorderPoint":5}'
```

## Migraciones

Los archivos SQL versionados están en `migrations/`. El comando siguiente crea la tabla de control `schema_migrations` y aplica únicamente archivos pendientes, cada uno dentro de una transacción:

```bash
npm run db:migrate
```

La aplicación también ejecuta las migraciones pendientes al iniciar.

## Pruebas

Suite unitaria, sin PostgreSQL:

```bash
npm run test:unit
```

Suite de integración con PostgreSQL temporal:

```bash
npm run test:integration
```

Ambas suites, en secuencia:

```bash
npm test
```

Los comandos usan `vitest run`, por lo que finalizan automáticamente y nunca entran en modo de observación.

### Aislamiento de la base de integración

`tests/integration/postgres-inventory.test.ts` inicia `postgres:16-alpine` con Testcontainers, obtiene la URI desde el contenedor y aplica las mismas migraciones de la aplicación. Reutiliza un contenedor durante el archivo de pruebas, pero ejecuta `TRUNCATE ... CASCADE` antes de cada caso. Al finalizar cierra el pool y detiene el contenedor.

Esta base es efímera e independiente de `DATABASE_URL`, de la base creada con Docker Compose y de cualquier ambiente de desarrollo o producción. No existe un servicio PostgreSQL en el workflow de GitHub Actions: Testcontainers crea y destruye la instancia.

## Integración continua

El workflow `.github/workflows/ci.yml` se ejecuta en cada `push` y `pull_request`. Expone dos jobs separados:

- **Pruebas unitarias (sin infraestructura):** instala con `npm ci`, comprueba tipos y ejecuta Vitest.
- **Integración (PostgreSQL con Testcontainers):** instala con `npm ci` y deja que Testcontainers administre PostgreSQL usando Docker disponible en el runner de GitHub.

Cualquier comando con error hace fallar su job; no se ignoran resultados.

## Estructura principal

```text
.github/workflows/ci.yml
migrations/001_create_inventory.sql
public/                         # interfaz tecnológica responsiva
src/application/               # reglas y puerto de persistencia
src/domain/                    # entidades y errores
src/infrastructure/            # PostgreSQL y migraciones
tests/unit/                    # Vitest sin infraestructura
tests/integration/             # PostgreSQL real con Testcontainers
```

## Seguridad de configuración

El repositorio solo contiene credenciales locales de ejemplo para el contenedor de desarrollo. `.env` está ignorado y no se versionan contraseñas reales ni secretos. La base temporal usa credenciales desechables definidas dentro de la prueba.
