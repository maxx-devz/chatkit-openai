// Portable role audit, shared by runtime guards and the operator diagnostic.
// Read catalogs only; do not log role names, connection strings or credentials.
export const RUNTIME_ROLE_SQL = `
WITH facts AS (
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='agency_platform' AND c.relname='backfill_state') AS adopted,
   current_user<>session_user AS changed_role,
   EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER') AND
     (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR
      r.rolname IN ('aoc_agency_owner','pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program'))) AS elevated_role,
   EXISTS(SELECT 1 FROM pg_catalog.pg_database d WHERE d.datname=current_database() AND pg_has_role(session_user,d.datdba,'MEMBER')) AS database_owner,
   EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','agency_platform') AND pg_has_role(session_user,n.nspowner,'MEMBER')) AS schema_owner,
   EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname='agency_platform' OR (n.nspname='public' AND
       (left(c.relname,7)='portal_' OR c.relname IN ('user','account','session','verification','rateLimit','twoFactor'))))
       AND pg_has_role(session_user,c.relowner,'MEMBER')) AS relation_owner
) SELECT *,NOT adopted OR NOT(changed_role OR elevated_role OR database_owner OR schema_owner OR relation_owner) AS allowed FROM facts`;

export function runtimeRoleError() {
  return Object.assign(new Error('Use a reviewed non-owner database runtime login for the adopted portal.'),{code:'unsafe_runtime_database_role'});
}

export async function assertRuntimeDatabaseRole(connection) {
  const {rows}=await connection.query(RUNTIME_ROLE_SQL);
  if(rows[0]?.allowed!==true)throw runtimeRoleError();
  return rows[0];
}

const wrappers=new WeakMap();
export function runtimeDatabasePool(pool) {
  if(wrappers.has(pool))return wrappers.get(pool);
  // Keep pg.Pool's prototype/type for Better Auth's adapter without creating a
  // second pool. Own writable methods remain compatible with existing fixtures.
  const runtime=Object.create(pool);
  const connect=async()=>{
    const connection=await pool.connect();
    try {await assertRuntimeDatabaseRole(connection);return connection;}
    catch(error){connection.release(error);throw error;}
  };
  runtime.connect=function(callback) {
    const pending=connect();
    if(typeof callback!=='function')return pending;
    pending.then(client=>callback(null,client,client.release.bind(client)),error=>callback(error));
  };
  runtime.query=function(...args) {
    const callback=typeof args.at(-1)==='function'?args.pop():null;
    const pending=(async()=>{
      const connection=await connect();
      let failure;
      try{return await connection.query(...args);}catch(error){failure=error;throw error;}finally{connection.release(failure);}
    })();
    if(!callback)return pending;
    pending.then(result=>callback(null,result),error=>callback(error));
  };
  for(const method of ['end','on','once','removeListener'])if(typeof pool[method]==='function')runtime[method]=pool[method].bind(pool);
  wrappers.set(pool,runtime);
  return runtime;
}
