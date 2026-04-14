import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

/** Fecha de inicio de datos operacionales. Usar getDefaultDesde() para queries con ventana relativa. */
export const DATA_START = new Date("2026-03-01");

/** Retorna fecha de inicio por defecto: últimos 90 días o DATA_START, lo que sea más reciente */
export function getDefaultDesde(diasAtras: number = 90): Date {
  const relativa = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return relativa > DATA_START ? relativa : DATA_START;
}

export const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
