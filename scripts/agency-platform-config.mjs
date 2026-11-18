export function approvedDatabaseTarget(value, confirmedDatabase) {
  let url;
  try { url = new URL(value); } catch { throw new Error("A dedicated agency database URL is required."); }
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { database = ""; }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname
    || !database || !confirmedDatabase || database !== confirmedDatabase) {
    throw new Error("Confirm the exact approved disposable database name before connecting.");
  }
  return value;
}

export function migrationArguments(args) {
  if (!args.length || (args.length === 1 && args[0] === "--plan")) return { apply: false };
  if (args.length === 3 && args[0] === "--apply" && args[1] === "--confirm-database" && args[2]) {
    return { apply: true, database: args[2] };
  }
  throw new Error("Use --plan, or --apply --confirm-database <approved-disposable-name>.");
}

export function safeDatabaseCode(error) {
  return /^[A-Z0-9_]{2,40}$/.test(error?.code || "") ? error.code : "agency_database_check_failed";
}
