"""PostgreSQL connections compatible with transaction-mode poolers."""
import psycopg
from psycopg.rows import dict_row

QUERY_TIMEOUT_MS = 10_000

RUNTIME_ROLE_SQL = """
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
) SELECT *,NOT adopted OR NOT(changed_role OR elevated_role OR database_owner OR schema_owner OR relation_owner) AS allowed FROM facts"""


class RuntimeDatabaseRoleError(RuntimeError):
    code = "unsafe_runtime_database_role"


async def assert_runtime_database_role(connection):
    row = await (await connection.execute(RUNTIME_ROLE_SQL)).fetchone()
    if not row or row.get("allowed") is not True:
        raise RuntimeDatabaseRoleError("Use a reviewed non-owner database runtime login for the adopted portal.")
    return row



class PortalConnection(psycopg.AsyncConnection):
    async def execute(self, query, params=None, *, prepare=None, binary=False):
        # Transaction poolers reject statement_timeout as a startup option.
        # A transaction-local setting bounds the query on PostgreSQL itself and
        # is reset before this pooled server connection is used by another request.
        async with self.transaction():
            await super().execute("SELECT set_config('statement_timeout', %s, true)",
                                  (str(QUERY_TIMEOUT_MS),))
            return await super().execute(query, params, prepare=prepare, binary=binary)


async def connect_database(dsn):
    connection = await PortalConnection.connect(
        dsn, autocommit=True, row_factory=dict_row, connect_timeout=8,
        prepare_threshold=None,
    )
    try:
        await assert_runtime_database_role(connection)
        return connection
    except BaseException:
        await connection.close()
        raise
