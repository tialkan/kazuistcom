import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../../packages/db/package.json', import.meta.url));
const {Pool}=require('pg');
const {PgBillingStore}=await import('../../../packages/ledger/src/billing/pg-store.ts');
const host = process.env.KAZUIST_D3_CRASH_SOCKET ?? '';
if (!host.startsWith('/tmp/kazuist-d3-crash.')) throw new Error('Use a dedicated temporary crash-test cluster');
const pool=new Pool({host,port:55437,database:'postgres',max:4});
const store=new PgBillingStore(pool,()=> 'unused');
if(process.argv[2]==='child') {
 const claimed=await store.claimOperation('test-user','test-operation','test-key','same-hash');
 assert.equal(claimed.state,'claimed');
 process.send?.('claimed');
 setInterval(()=>{},1000);
} else {
 let child;
 try {
  await pool.query('create table idempotency_keys(user_id text,operation text,key text,request_hash text,response_status integer,response_body jsonb,expires_at timestamptz,primary key(user_id,operation,key))');
  child=fork(new URL(import.meta.url),['child'],{execArgv:process.execArgv,stdio:['ignore','ignore','ignore','ipc']});
  const [message]=await once(child,'message');assert.equal(message,'claimed');
  assert.equal((await store.claimOperation('test-user','test-operation','test-key','same-hash')).state,'pending');
  assert.equal((await store.claimOperation('test-user','test-operation','test-key','different-hash')).state,'conflict');
  child.kill('SIGKILL');await once(child,'exit');
  let state;
  for(let i=0;i<20;i++) {state=await store.claimOperation('test-user','test-operation','test-key','same-hash');if(state.state==='claimed')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(state.state,'claimed');
  await store.finishOperation('test-user','test-operation','test-key',{result:'stable-result'});
  assert.deepEqual(await store.claimOperation('test-user','test-operation','test-key','same-hash'),{state:'done',result:{result:'stable-result'}});
  assert.equal((await store.claimOperation('test-user','test-operation','test-key','different-hash')).state,'conflict');
  console.log('PASS: actual PostgreSQL owner process SIGKILL, session lock release, persisted pending recovery, exact replay and body conflict. No provider calls.');
 } finally {if(child&&!child.killed)child.kill('SIGKILL');await pool.end();}
}
