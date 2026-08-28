import { getMigrations } from "better-auth/db/migration";

import {
  auth,
  closeAuthDatabase,
  isPortalAuthConfigured,
} from "../lib/auth.js";

try {
  if (!isPortalAuthConfigured()) {
    throw new Error(
      "DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL must be set in .env.local.",
    );
  }

  const migration = await getMigrations(auth.options);
  const changeCount = migration.toBeCreated.length
    + migration.toBeAdded.length
    + migration.toBeAddedIndexes.length;

  if (!changeCount) {
    console.log("Better Auth database tables are already up to date.");
  } else {
    console.log(`Applying ${changeCount} Better Auth database change(s)...`);
    await migration.runMigrations();
    console.log("Better Auth database migration completed.");
  }
} catch (error) {
  console.error(`Authentication migration failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeAuthDatabase().catch(() => null);
}
