import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const window = {};
for (const file of ['navigation-model.js', 'presentation-context.js', 'navigation-projection.js', 'driver-self.js', 'driver-presentation.js']) {
  vm.runInNewContext(read(file), {window});
}
const AT = '2026-09-03T12:00:00Z';
function fixture(options = {}) {
  const role = options.role || 'driver';
  let session = {sessionToken:'token-a', me:{crewbiq_id:'account-a', active_workspace_id:'ws-a', memberships:[
    {status:'active', workspace:{id:'ws-a'}, roles:[role], capabilities:[]},
  ]}};
  const calls = [], results = [];
  const link = {ok:true, link:{linkId:'link-a', workspaceId:'ws-a', accountId:'account-a', driverId:'driver-a', status:'active', effectiveFrom:'2026-09-01T00:00:00Z', effectiveTo:null}};
  const assignment = {ok:true, assignment:{workspaceId:'ws-a', driverId:'driver-a', truckId:'truck-a', status:'active', effectiveFrom:'2026-09-01T00:00:00Z', effectiveTo:null}};
  const coordinator = window.CrewBIQDriverPresentation.create({
    getSession:()=>session,
    resolveWorkspace:s=>({ok:true,workspaceId:s.me.active_workspace_id}),
    getAccountId:s=>s.me.crewbiq_id,
    getLegacyPersona:()=> 'fleet',
    now:()=>AT,
    createSelfReader:window.CrewBIQDriverSelf.create,
    readAccountDriverLink:async payload=>{calls.push(['link',payload]); return options.readLink ? options.readLink(payload) : link;},
    readCurrentAssignment:async payload=>{calls.push(['assignment',payload]); return options.assignment || assignment;},
    resolvePresentationContext:window.CrewBIQPresentationContext.resolvePresentationContext,
    projectNavigation:window.CrewBIQNavigationProjection.projectNavigation,
    navigationModel:window.CrewBIQNavigationModel,
    onResult:value=>results.push(value),
  });
  return {coordinator,calls,results,link,session,setSession:value=>{session=value;}};
}
test('construction is inert and successful Driver refresh shares one SELF evidence chain', async()=>{
  const f=fixture(); assert.equal(f.calls.length,0); assert.equal(f.results.length,0);
  const result=await f.coordinator.refresh(false);
  assert.equal(result.applyDriver,true); assert.equal(result.projection.presentationPersona,'driver');
  assert.equal(result.selfState.truckId,'truck-a'); assert.equal(f.calls.length,2);
  assert.equal(f.calls[0][0],'link'); assert.equal(f.calls[1][0],'assignment');
});
test('no account performs no request and returns legacy-compatible unavailable state',async()=>{
  const f=fixture(); f.setSession(null); const result=await f.coordinator.refresh(false);
  assert.equal(result.applyDriver,false); assert.equal(result.selfState.status,'unavailable'); assert.equal(f.calls.length,0);
});
test('network failure cannot fabricate canonical identities or narrow legacy presentation',async()=>{
  const f=fixture({readLink:async()=>{throw new Error('offline');}});
  const result=await f.coordinator.refresh(false);
  assert.equal(result.applyDriver,false); assert.equal(result.selfState.status,'unavailable');
  assert.equal(result.context.relationshipScope.accountDriverLinkId,null); assert.equal(f.calls.length,1);
});
test('assignment authorization denial is unavailable authority, not successful Driver integration',async()=>{
  const f=fixture({assignment:{ok:false,code:'driver_truck_assignment_unauthorized'}});
  const result=await f.coordinator.refresh(false);
  assert.equal(result.selfState.status,'unauthorized'); assert.equal(result.applyDriver,false);
  assert.equal(result.context.relationshipScope.currentDriverTruckAssignment,null);
});
test('Fleet and Carrier never receive Driver shell narrowing',async()=>{
  for(const role of ['fleet','carrier']){
    const result=await fixture({role}).coordinator.refresh(false);
    assert.equal(result.applyDriver,false);
  }
});
test('ambiguous membership cannot apply partial projection',async()=>{
  const f=fixture(); f.session.me.memberships.push({...f.session.me.memberships[0]});
  const result=await f.coordinator.refresh(false);
  assert.equal(result.context.status,'ambiguous'); assert.equal(result.applyDriver,false);
});
test('concurrent ordinary refreshes reuse one pending request',async()=>{
  const f=fixture(); const a=f.coordinator.refresh(false), b=f.coordinator.refresh(false);
  assert.equal(a,b); await a; assert.equal(f.calls.length,2);
});
test('session change before completion discards stale results',async()=>{
  let release; const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture({readLink:()=>pending}); const request=f.coordinator.refresh(false);
  f.setSession(null); f.coordinator.invalidate(); release(f.link); await request;
  assert.equal(f.results.some(result=>result.applyDriver),false);
});
test('render-time key guard rejects already-resolved projection after account/workspace/session changes',()=>{
  const html=read('index.html');
  const keyFn=html.match(/function driverPresentationSnapshotKey\(\)\{[\s\S]*?\n\}/)?.[0];
  const roleFn=html.match(/function getDriverShellPresentationRole\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(keyFn && roleFn);
  let session={sessionToken:'token-a',workspaceId:'ws-a',accountId:'account-a'};
  const ctx={driverNavigationProjection:{status:'resolved',membershipRole:'driver',presentationPersona:'driver'},
    driverNavigationProjectionKey:'token-a|ws-a|account-a',getUserRole:()=> 'fleet',
    loadOrchestratorSession:()=>session,canonicalOrchestratorAccountId:s=>s.accountId,
    window:{CrewBIQWorkspaceAttribution:{resolveActiveWorkspace:s=>({ok:true,workspaceId:s.workspaceId})}}};
  vm.runInNewContext(keyFn+'\n'+roleFn,ctx);
  assert.equal(ctx.getDriverShellPresentationRole(),'driver');
  for(const changed of [{sessionToken:'token-b'},{workspaceId:'ws-b'},{accountId:'account-b'}]){
    session={sessionToken:'token-a',workspaceId:'ws-a',accountId:'account-a',...changed};
    assert.equal(ctx.getDriverShellPresentationRole(),'fleet');
  }
  session=null; assert.equal(ctx.getDriverShellPresentationRole(),'fleet');
});
test('new modules load once before inline application and are included in cache v98',()=>{
  const html=read('index.html'), sw=read('sw.js');
  const files=['navigation-model.js','presentation-context.js','navigation-projection.js','driver-presentation.js'];
  let previous=-1;
  for(const file of files){
    const marker='<script src="'+file; assert.equal(html.split(marker).length-1,1);
    const position=html.indexOf(marker); assert.ok(position>previous); previous=position;
    assert.ok(sw.includes('/crewbiq-driver/'+file));
  }
  assert.match(sw,/const CACHE_NAME = 'crewbiq-driver-v98'/);
  assert.match(html,/function refreshDriverSelfCard\(force\)\{[\s\S]*?coordinator\.refresh\(!!force\)/);
  assert.match(html,/async function onOrchDisconnectClick\(\)\{\s*invalidateDriverPresentation\(\)/);
  assert.doesNotMatch(read('driver-presentation.js'),/localStorage|sessionStorage|document\.|fetch\(|showApp\(|showPTIBlocker\(|scheduleAutoSync/);
});
