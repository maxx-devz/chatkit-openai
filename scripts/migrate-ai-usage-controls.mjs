import {readFile} from 'node:fs/promises';
import pg from 'pg';
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
try{await db.connect();await db.query(await readFile(new URL('../database/ai-usage-controls.sql',import.meta.url),'utf8'));console.log('AI usage-history controls ready. Existing records were not cleared.');}
catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Usage controls migration failed',{code:error.code || error.name});process.exitCode=1;}
finally{await db.end().catch(()=>{});}
