import 'dotenv/config';

export interface AppConfig {
  databaseUrl: string;
  host: string;
  port: number;
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://orbit:orbit@localhost:5433/orbit_stock',
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
  };
}
