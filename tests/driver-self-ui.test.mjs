import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source=fs.readFileSync(path.join(root,'driver-self.js'),'utf8');
const linkSource=fs.readFileSync(path.join(root,'account-driver-link.js'),'utf8');
const assignmentSource=fs.readFileSync(path.join(root,'driver-truck-assignment.js'),'utf8');
function api(){ const context={}; context.globalThis=context; vm.runInNewContext(source,context); return context.CrewBIQDriverSelf; }
const json=(value)=>JSON.parse(JSON.stringify(value));
const base={sessionToken:'token',workspaceId:'ws_1',accountId:'acct_1'};

test('chains canonical AccountDriverLink to current DriverTruckAssignment', async()=>{
  const calls=[];
  const reader=api().create({
    readAccountDriverLink:async payload=>{ calls.push(['link',json(payload)]); return {ok:true,link:{accountId:'acct_1',workspaceId:'ws_1',driverId:'drv_1'}}; },
    readCurrentAssignment:async payload=>{ calls.push(['assignment',json(payload)]); return {ok:true,assignment:{workspaceId:'ws_1',driverId:'drv_1',truckId:'trk_1'}}; },
  });
  assert.deepEqual(json(await reader.read(base)),{status:'success',workspaceId:'ws_1',accountId:'acct_1',driverId:'drv_1',truckId:'trk_1',assignment:{workspaceId:'ws_1',driverId:'drv_1',truckId:'trk_1'}});
  assert.equal(calls[1][1].driverId,'drv_1');
});

test('composes the accepted adapters using their production return shapes', async()=>{
  const context={window:{},globalThis:{},Date,Object,Array,Set,Number,String,URLSearchParams};
  vm.createContext(context);
  vm.runInContext(linkSource,context);
  vm.runInContext(assignmentSource,context);
  const provenance={source:'explicit',attributedByAccountId:'admin_1',attributedAt:'2026-08-01T00:00:00Z',reason:'Verified'};
  const linkAdapter=context.window.CrewBIQIdentityLink.create({request:async()=>({ok:true,workspaceId:'ws_1',accountId:'acct_1',accountIdSpace:'crewbiq_account',links:[{linkId:'link_1',workspaceId:'ws_1',accountId:'acct_1',driverId:'drv_1',status:'active',effectiveFrom:'2026-08-01T00:00:00Z',effectiveTo:null,provenance}]})});
  const assignmentAdapter=context.window.CrewBIQDriverTruckAssignment.create({request:async()=>({ok:true,workspace_id:'ws_1',view:'current',as_of:'2026-08-31T12:00:00Z',assignments:[{id:'assignment_1',workspace_id:'ws_1',driver_id:'drv_1',truck_id:'trk_1',effective_from:'2026-08-01T00:00:00Z',effective_to:null,assignment_type:'solo',status:'active',version:1,created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-01T00:00:00Z',provenance:{evidence_type:'dispatch'}}]})});
  const reader=api().create({readAccountDriverLink:payload=>linkAdapter.read(payload),readCurrentAssignment:payload=>assignmentAdapter.readCurrent(payload)});
  const result=json(await reader.read({...base,effectiveAt:'2026-08-31T12:00:00Z'}));
  assert.equal(result.status,'success');
  assert.equal(result.driverId,'drv_1');
  assert.equal(result.truckId,'trk_1');
});

test('not-linked account never invokes assignment read', async()=>{
  let assignmentReads=0;
  const reader=api().create({readAccountDriverLink:async()=>({ok:false,code:'account_driver_link_not_found'}),readCurrentAssignment:async()=>{ assignmentReads++; }});
  assert.deepEqual(json(await reader.read(base)),{status:'not_linked'});
  assert.equal(assignmentReads,0);
});

test('ambiguous link fails closed without selecting a Driver', async()=>{
  let assignmentReads=0;
  const reader=api().create({readAccountDriverLink:async()=>({ok:false,code:'ambiguous_account_driver_link'}),readCurrentAssignment:async()=>{ assignmentReads++; }});
  assert.deepEqual(json(await reader.read(base)),{status:'ambiguous'});
  assert.equal(assignmentReads,0);
});

test('cross-workspace or mismatched canonical link fails closed', async()=>{
  const reader=api().create({readAccountDriverLink:async()=>({ok:true,link:{accountId:'acct_1',workspaceId:'ws_2',driverId:'drv_1'}}),readCurrentAssignment:async()=>assert.fail('must not read assignment')});
  assert.deepEqual(json(await reader.read(base)),{status:'ambiguous'});
});

test('unauthorized and unavailable reads remain explicit', async()=>{
  const unauthorized=api().create({readAccountDriverLink:async()=>({ok:false,code:'unauthorized_workspace'}),readCurrentAssignment:async()=>{}});
  const unavailable=api().create({readAccountDriverLink:async()=>{ throw new Error('offline'); },readCurrentAssignment:async()=>{}});
  assert.deepEqual(json(await unauthorized.read(base)),{status:'unauthorized'});
  assert.deepEqual(json(await unavailable.read(base)),{status:'unavailable'});
});

test('ambiguous or cross-workspace current assignment fails closed', async()=>{
  const link=async()=>({ok:true,link:{accountId:'acct_1',workspaceId:'ws_1',driverId:'drv_1'}});
  const ambiguous=api().create({readAccountDriverLink:link,readCurrentAssignment:async()=>({ok:false,code:'ambiguous_current_assignment'})});
  const crossWorkspace=api().create({readAccountDriverLink:link,readCurrentAssignment:async()=>({ok:true,assignment:{workspaceId:'ws_2',driverId:'drv_1',truckId:'trk_1'}})});
  assert.deepEqual(json(await ambiguous.read(base)),{status:'ambiguous'});
  assert.deepEqual(json(await crossWorkspace.read(base)),{status:'ambiguous'});
});

test('index uses only authenticated canonical account identity and read-only controls',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(index,/function canonicalOrchestratorAccountId\(session\)[\s\S]*me\.crewbiq_id \|\| me\.crewbiqId/);
  assert.doesNotMatch(index,/canonicalOrchestratorAccountId[\s\S]{0,300}driver\.accountId/);
  assert.match(index,/readAccountDriverLink:\(payload\)=>linkAdapter\.read\(payload\)/);
  assert.match(index,/readCurrentAssignment:\(payload\)=>assignmentAdapter\.readCurrent\(payload\)/);
  const cardStart=index.indexOf('id="driverSelfCard"');
  const cardEnd=index.indexOf('<div class="sync-row"',cardStart);
  const card=cardStart >= 0 && cardEnd > cardStart ? index.slice(cardStart,cardEnd) : '';
  assert.ok(card);
  assert.doesNotMatch(card,/<(?:input|select|textarea)\b/i);
  assert.doesNotMatch(card,/onclick="(?!refreshDriverSelfCard\(true\))[^"]+"/i);
});

test('transport and app shell wire the read-only SELF composition',()=>{
  const runtime=fs.readFileSync(path.join(root,'core-runtime.js'),'utf8');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(runtime,/account_driver_link_read[\s\S]*adaptAccountDriverLinkRead/);
  assert.match(runtime,/\/account-driver-link/);
  assert.match(index,/account-driver-link\.js/);
  assert.match(index,/driver-self\.js/);
  assert.match(sw,/crewbiq-driver-v98/);
  assert.match(sw,/account-driver-link\.js/);
  assert.match(sw,/driver-self\.js/);
});
