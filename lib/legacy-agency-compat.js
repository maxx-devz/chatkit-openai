// Existing legacy AOC routes only. New agency routes remain unavailable.
// Query the marker every time: activation/revocation must not depend on a cache.
export async function legacyBackfillInstalled(db) {
  const {rows}=await db.query(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='agency_platform' AND c.relname='backfill_state' AND c.relkind='r') AS installed`);
  return rows[0]?.installed===true;
}

export async function filterLegacyAocMemberships(db,rows) {
  if(!rows.length || !await legacyBackfillInstalled(db)) return rows;
  const {rows:allowed}=await db.query(`SELECT client_id::text AS id
    FROM agency_platform.legacy_aoc_clients($1::bigint[]) AS visible(client_id)`,[rows.map(r=>String(r.id))]);
  const ids=new Set(allowed.map(r=>r.id));
  return rows.filter(r=>ids.has(String(r.id)));
}

export async function legacyPublicationPredicate(db) {
  return await legacyBackfillInstalled(db)
    ? ' AND agency_platform.legacy_publication_allowed(p.owner_id,p.audience,$2::bigint,$3::bigint)'
    : '';
}
