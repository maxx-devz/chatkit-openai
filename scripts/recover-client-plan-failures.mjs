import {databasePool} from '../lib/postgres.js';
import {recoverClientPlanFailures} from '../lib/client-plan-recovery.js';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
try {
 const url=process.env.DATABASE_URL;if(!url||!args.includes('--confirm-database')||!args.includes('--client-id'))throw Error('Provide the approved database and exact client ID.');
 const target=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&!args.includes('--allow-remote'))throw Error('Remote repair needs explicit approval and --allow-remote.');
 if((await databasePool.query('SELECT current_database() AS name')).rows[0].name!==value('--confirm-database'))throw Error('Database confirmation does not match.');
 const result=await recoverClientPlanFailures(databasePool,{clientId:value('--client-id'),actorId:args.includes('--actor-id')?value('--actor-id'):undefined,apply:args.includes('--apply')});
 console.log(JSON.stringify(result));
}catch(error){console.error('Scoped failed-reply recovery failed:',error.code||error.message);process.exitCode=1;}finally{await databasePool.end();}
