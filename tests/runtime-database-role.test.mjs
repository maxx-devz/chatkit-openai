import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeDatabasePool,RUNTIME_ROLE_SQL} from '../lib/runtime-database-role.js';

function fixture() {
  let allowed=true;
  const calls=[],released=[];
  const client={query:async sql=>{calls.push(sql);return sql===RUNTIME_ROLE_SQL?{rows:[{adopted:true,allowed}]}:{rows:[{value:1}]};},release:error=>released.push(error)};
  const pool={connect:async()=>client,end(){},on(){},once(){},removeListener(){}};
  return {pool,client,calls,released,unsafe:()=>{allowed=false;}};
}
test('runtime pool checks each borrow and refuses privilege changes before application SQL',async()=>{
  const f=fixture(),runtime=runtimeDatabasePool(f.pool);
  assert.equal(runtimeDatabasePool(f.pool),runtime);
  assert.equal((await runtime.query('SELECT permitted')).rows[0].value,1);
  f.unsafe();await assert.rejects(runtime.query('SELECT sensitive'),{code:'unsafe_runtime_database_role'});
  assert.ok(!f.calls.includes('SELECT sensitive'));assert.equal(f.released[1].code,'unsafe_runtime_database_role');
});
test('pg callback query and connect interfaces retain authorization and lease release',async()=>{
  const f=fixture(),runtime=runtimeDatabasePool(f.pool);
  const result=await new Promise((resolve,reject)=>runtime.query('SELECT callback',(error,result)=>error?reject(error):resolve(result)));
  assert.equal(result.rows[0].value,1);assert.equal(f.released.length,1);
  await new Promise((resolve,reject)=>runtime.connect((error,client,release)=>{if(error)return reject(error);assert.equal(client,f.client);release();resolve();}));
  f.unsafe();await new Promise(resolve=>runtime.connect(error=>{assert.equal(error.code,'unsafe_runtime_database_role');resolve();}));
});

test('application query errors discard the borrowed connection like pg.Pool.query',async()=>{
  const f=fixture(),runtime=runtimeDatabasePool(f.pool),failure=new Error('synthetic query failure');
  f.client.query=async sql=>{if(sql===RUNTIME_ROLE_SQL)return {rows:[{allowed:true}]};throw failure;};
  await assert.rejects(runtime.query('SELECT failed'),failure);
  assert.equal(f.released[0],failure);
});
