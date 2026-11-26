"""Preview by default. Apply only an explicitly approved exact reconciliation."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit
import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "chatkit_backend"))
from database import connect_database
from reconcile_plan_usage import preview_usage_reconciliation, apply_usage_reconciliation

async def main(args):
    env = {**(dotenv_values(ROOT / args.env_file) if args.env_file else {}), **os.environ}
    dsn = env.get("DATABASE_URL", "")
    if not dsn:
        raise ValueError("Configure DATABASE_URL privately for the approved target")
    target = urlsplit(dsn)
    if target.hostname not in ("127.0.0.1", "localhost", "::1") and not args.allow_remote:
        raise ValueError("Remote database use requires explicit approval and --allow-remote")
    db = await connect_database(dsn)
    try:
        row = await (await db.execute("SELECT current_database() AS name")).fetchone()
        if row["name"] != args.confirm_database:
            raise ValueError("Database confirmation does not match")
        if args.apply:
            if not args.actor_id or not args.expected_digest or not args.confirm_credits:
                raise ValueError("Apply requires admin actor, exact preview digest and approved credits")
            result = await apply_usage_reconciliation(db,args.client_id,args.run_id,args.actor_id,args.expected_digest,args.confirm_credits)
        else:
            async with db.transaction(force_rollback=True):
                await psycopg.AsyncConnection.execute(db,"SET TRANSACTION READ ONLY")
                result = {"applied":False,**await preview_usage_reconciliation(db,args.client_id,args.run_id)}
        print(json.dumps(result))
    finally:
        await db.close()

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file")
    parser.add_argument("--confirm-database",required=True)
    parser.add_argument("--client-id",required=True)
    parser.add_argument("--run-id",required=True)
    parser.add_argument("--allow-remote",action="store_true")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--actor-id")
    parser.add_argument("--expected-digest")
    parser.add_argument("--confirm-credits")
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        asyncio.run(main(parser.parse_args()))
    except Exception as error:
        # No DSNs, raw DB exceptions or provider bodies in console diagnostics.
        print("Reconciliation did not apply:",str(error) if isinstance(error,ValueError) else type(error).__name__,file=sys.stderr)
        sys.exit(1)
