import pg from "pg";

const { Pool } = pg;
const POOL_KEY = Symbol.for("aoc-portal.database-pool");
const DISABLED_DATABASE_URL =
  "postgresql://aoc-disabled:aoc-disabled@127.0.0.1:1/aoc-disabled";

function configuredPoolMaximum() {
  const value = Number(process.env.DATABASE_POOL_MAX || 3);
  return Number.isSafeInteger(value) && value >= 1 && value <= 10 ? value : 3;
}

function createDatabasePool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL || DISABLED_DATABASE_URL,
    max: configuredPoolMaximum(),
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 20_000,
    query_timeout: 10_000,
  });
}

export const databasePool = globalThis[POOL_KEY] || createDatabasePool();
globalThis[POOL_KEY] = databasePool;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function parameterizedSql(strings, values) {
  if (
    !Array.isArray(strings)
    || !Array.isArray(strings.raw)
    || strings.length !== values.length + 1
  ) {
    throw new TypeError("Database queries must use the sql tagged template.");
  }

  let text = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    text += `$${index + 1}${strings[index + 1]}`;
  }
  return { text, values };
}

// Compatibility tag for repositories that use tagged-template queries. Values
// always become node-postgres parameters.
export async function databaseSql(strings, ...values) {
  if (!isDatabaseConfigured()) throw new Error("Database is not configured.");
  const query = parameterizedSql(strings, values);
  return (await databasePool.query(query.text, query.values)).rows;
}

export async function closeDatabasePool() {
  await databasePool.end();
  if (globalThis[POOL_KEY] === databasePool) delete globalThis[POOL_KEY];
}
