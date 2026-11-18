// Server-side transaction primitive. Unwired to routes until Stage 11.
// The caller must supply authenticated server context, never browser claims.
export class AgencyScopeError extends Error {
  constructor() {
    super("A restricted agency database connection and authorized scope are required.");
    this.code = "agency_scope_denied";
  }
}

function scopeId(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value)
    || BigInt(value) > 9223372036854775807n) throw new AgencyScopeError();
  return value;
}

const CLEAN_CONTEXT = `
  NULLIF(current_setting('aoc.agency_id',true),'') IS NULL
  AND NULLIF(current_setting('aoc.actor_id',true),'') IS NULL
  AND NULLIF(current_setting('aoc.client_id',true),'') IS NULL AS clean_context`;

export async function withAgencyScope(pool, scope, operation) {
  const agencyId = scopeId(scope?.agencyId);
  const actorId = scopeId(scope?.actorId);
  const clientId = scopeId(scope?.clientId);
  if (typeof operation !== "function") throw new AgencyScopeError();
  const connection = await pool.connect();
  let transaction = false;
  let active = false;
  let discard;
  try {
    // One checked-out connection owns BEGIN, settings, all work and COMMIT.
    await connection.query("BEGIN");
    transaction = true;
    const { rows: [initial] } = await connection.query(`SELECT
      current_user=session_user AS direct_login,
      agency_platform.runtime_role_safe() AS safe_role, ${CLEAN_CONTEXT}`);
    if (!initial?.direct_login || !initial.safe_role || !initial.clean_context) {
      discard = new AgencyScopeError();
      throw discard;
    }
    await connection.query(`SELECT set_config('aoc.agency_id',$1,true),
      set_config('aoc.actor_id',$2,true), set_config('aoc.client_id',$3,true)`,
    [agencyId, actorId, clientId]);
    const { rows: [authorized] } = await connection.query(`SELECT
      agency_platform.current_agency()::text AS agency_id,
      agency_platform.client_allowed($1::bigint) AS client_allowed`, [clientId]);
    if (authorized?.agency_id !== agencyId || !authorized.client_allowed) throw new AgencyScopeError();
    active = true;
    const query = (text, values) => {
      if (!active) throw new AgencyScopeError();
      return connection.query(text, values);
    };
    const result = await operation(Object.freeze({ query }));
    active = false;
    await connection.query("COMMIT");
    transaction = false;
    const { rows: [released] } = await connection.query(`SELECT ${CLEAN_CONTEXT}`);
    if (!released?.clean_context) {
      discard = new AgencyScopeError();
      throw discard;
    }
    return result;
  } catch (error) {
    active = false;
    if (transaction) {
      try {
        await connection.query("ROLLBACK");
        const { rows: [released] } = await connection.query(`SELECT ${CLEAN_CONTEXT}`);
        if (!released?.clean_context) discard = new AgencyScopeError();
      } catch {
        discard = new AgencyScopeError();
      }
    } else {
      discard ||= error;
    }
    throw error;
  } finally {
    active = false;
    connection.release(discard);
  }
}
