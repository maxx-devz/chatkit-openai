import "server-only";
import { databasePool } from "./database.js";
import { withAgencyScope } from "./agency-scope.js";

// Deliberately not imported by any page/route/worker before Stage 11.
// The current broad legacy DATABASE_URL must fail this function's role checks.
export function withAgencyDatabaseScope(scope, operation) {
  return withAgencyScope(databasePool, scope, operation);
}
