// Isolated appearance fixture only. This process must never use a real database.
import {databasePool} from '../../../lib/postgres.js';
if(process.env.DATABASE_URL)throw new Error('UI fixtures require database access to be disabled.');
databasePool.query=async text=>{
  if(typeof text==='string' && text.includes('SELECT c.assistant_instructions') && text.includes('portal_assistant_configs'))return {rows:[]};
  throw new Error('A database call was attempted outside the isolated appearance fixture.');
};
