import "server-only";
import {databasePool as provisioningPool,parameterizedSql,isDatabaseConfigured} from "./postgres.js";
import {runtimeDatabasePool} from "./runtime-database-role.js";
export {isDatabaseConfigured};
export const databasePool=runtimeDatabasePool(provisioningPool);
export async function databaseSql(strings,...values) {
  if(!isDatabaseConfigured())throw new Error("Database is not configured.");
  const query=parameterizedSql(strings,values);
  return (await databasePool.query(query.text,query.values)).rows;
}
