import "server-only";
import { databasePool } from "./database.js";

function denied() {
  return Object.assign(new Error("This connection changed or is unavailable in the current workspace."),
    {publicDetails:{code:"connection_scope_changed",message:"This connection changed or is unavailable in the current workspace.",status:409}});
}

export async function integrationScope(session, service, resource, ownerId = null, clientId = null, db = databasePool) {
  const actor = session?.user?.id, login = session?.session?.id;
  if (!actor || !login) throw denied();
  const args = [actor,login,service,String(resource),ownerId,clientId];
  try {
    const {rows} = await db.query("SELECT agency_id::text,generation::text FROM agency_platform.connection_scope($1,$2,$3,$4,$5,$6)",args);
    if (!rows[0]) throw denied();
    return {...rows[0],args};
  } catch {throw denied();}
}

export function sameIntegration(current, expected) {
  if (!expected || current.agency_id !== expected.agency_id || current.generation !== expected.generation ||
      JSON.stringify(current.args.slice(2)) !== JSON.stringify(expected.args.slice(2))) throw denied();
}

export async function commitIntegration(scope, session, write, db = databasePool) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT agency_platform.advance_connection($1,$2,$3,$4,$5,$6,$7)",[
      session?.user?.id,session?.session?.id,...scope.args.slice(2),scope.generation]);
    await write(client);
    await client.query("COMMIT");
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    if (error?.code === "42501") throw denied();
    throw error;
  } finally {client.release();}
}
