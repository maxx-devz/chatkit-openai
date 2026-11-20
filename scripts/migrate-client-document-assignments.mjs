import pg from "pg";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
async function main(){
 const args=process.argv.slice(2), [confirm,name,roleFlag,role,...extra]=args;
 if(confirm!=="--confirm-database"||roleFlag!=="--app-role"||!name||! /^[a-z][a-z0-9_]{1,62}$/.test(role||"")||extra.some(x=>x!=="--allow-remote"))throw Error("Provide --confirm-database NAME --app-role ROLE and the private migration URL.");
 const u=new URL(process.env.CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL||"");
 if(!["postgres:","postgresql:"].includes(u.protocol)||decodeURIComponent(u.pathname.slice(1))!==name||(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&!extra.includes("--allow-remote")))throw Error("Use a confirmed disposable target; remote targets require separate approval and --allow-remote.");
 const sql=await readFile(new URL("../database/client-document-assignments.sql",import.meta.url),"utf8"),checksum=createHash("sha256").update(sql.replace(/\r\n/g,"\n")).digest("hex");
 const db=new pg.Client({connectionString:u.href,connectionTimeoutMillis:8000});
 try{await db.connect();if((await db.query("SELECT current_database() name")).rows[0].name!==name)throw Error("Database identity mismatch");
 await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SELECT pg_advisory_xact_lock(734901,201)");
 if(!(await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin",[role])).rowCount)throw Error("Runtime role not found");
 await db.query("CREATE TABLE IF NOT EXISTS portal_client_document_schema(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
 const old=(await db.query("SELECT checksum FROM portal_client_document_schema WHERE version='001_assignments'")).rows[0];
 if(old&&old.checksum!==checksum)throw Error("Applied migration checksum mismatch");
 if(!old){await db.query(sql);await db.query("INSERT INTO portal_client_document_schema(version,checksum) VALUES('001_assignments',$1)",[checksum]);}
 const delivery=await readFile(new URL("../database/client-document-delivery.sql",import.meta.url),"utf8");
 const deliveryHash=createHash("sha256").update(delivery.replace(/\r\n/g,"\n")).digest("hex");
 const applied=(await db.query("SELECT checksum FROM portal_client_document_schema WHERE version='002_delivery'")).rows[0];
 if(applied&&applied.checksum!==deliveryHash)throw Error("Delivery migration checksum mismatch");
 if(!applied){await db.query(delivery);await db.query("INSERT INTO portal_client_document_schema(version,checksum) VALUES('002_delivery',$1)",[deliveryHash]);}
 await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON portal_document_connections,portal_document_oauth_states TO "${role}"`);
 await db.query(`GRANT SELECT,INSERT,UPDATE ON portal_document_releases,portal_client_journey TO "${role}"`);
 await db.query(`GRANT SELECT,INSERT ON portal_document_delivery_audit,portal_document_connection_audit TO "${role}"`);
 await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_document_delivery_audit_id_seq,portal_document_connection_audit_id_seq TO "${role}"`);
 await db.query(`GRANT SELECT,INSERT,UPDATE ON portal_client_document_assignments TO "${role}"`);
 await db.query(`GRANT SELECT,INSERT ON portal_client_document_assignment_audit TO "${role}"`);
 await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_client_document_assignment_audit_id_seq TO "${role}"`);
 await db.query("COMMIT");console.log("Client document setup schema ready; no clients, files, credits or existing history changed.");
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}finally{await db.end();}
}
main().catch(e=>{console.error("Client document migration stopped",{code:e.code||"setup_error"});process.exitCode=1;});
