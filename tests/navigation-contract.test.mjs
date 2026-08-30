import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../navigation-model.js',import.meta.url),'utf8');
const core=readFileSync(new URL('../core-runtime.js',import.meta.url),'utf8');
function load(){const window={};vm.runInNewContext(source,{window});return window.CrewBIQNavigationModel;}
const api=load();
const plain=value=>JSON.parse(JSON.stringify(value));
const roleOrder={
  driver:['load','report','expenses','scan','disputes','pti','stats','community','settings'],
  owner_op:['load','report','expenses','scan','fuel','deductions','service','disputes','pti','stats','community','settings'],
  fleet:['load','fleet','drivers','report','expenses','scan','fuel','deductions','service','disputes','pti','stats','community','settings']};
const groupOrder={
  driver:['load','disputes','scan','pti','expenses','report','stats','community','settings'],
  owner_op:['load','disputes','scan','pti','fuel','service','expenses','report','stats','deductions','community','settings'],
  fleet:['load','disputes','scan','pti','fuel','service','expenses','report','stats','deductions','fleet','drivers','community','settings']};
test('UNIT_CONTRACT module parses independently and exports namespace',()=>{
  assert.ok(api);assert.deepEqual(Object.keys(api),['ROLE_CONFIG','FUNCTION_GROUPS','ROLE_RANK','PRIMARY_NAV_PAGES','PAGE_REGISTRY','roleConfig','visibleFunctionGroups','roleMenuTargets','groupedTargets','bottomDestinationsForRole','primaryDestinationForPage']);
});
for(const role of Object.keys(roleOrder)) test(`UNIT_CONTRACT ${role} models remain exact`,()=>{
  assert.deepEqual(plain(api.roleMenuTargets(role)),roleOrder[role]);assert.deepEqual(plain(api.groupedTargets(role)),groupOrder[role]);
});
test('UNIT_CONTRACT ROLE_CONFIG deep shape and effective scan order remain exact',()=>{
  assert.deepEqual(Object.keys(api.ROLE_CONFIG),['driver','owner_op','fleet']);
  assert.deepEqual(plain(Object.values(api.ROLE_CONFIG).map(x=>[x.label,x.icon,x.desc])),[
    ['Driver','🚛','Load tracking, PTI, expenses, sync'],['Owner-Op','🏢','Driver + fuel, deductions, service fund, P&L'],['Fleet','🚚','Owner-Op + fleet dashboard, multi-truck, drivers']]);
  for(const role of Object.keys(roleOrder)) assert.deepEqual(plain(api.ROLE_CONFIG[role].menu.find(x=>x.page==='scan')),{page:'scan',icon:'📷',label:'Scan'});
});
test('UNIT_CONTRACT FUNCTION_GROUPS deep shape and order remain exact',()=>{
  assert.deepEqual(plain(api.FUNCTION_GROUPS.map(x=>x.label)),['Work','Truck','Money','Team','Resources & account']);
  assert.deepEqual(plain(api.FUNCTION_GROUPS.find(x=>x.label==='Team').roles),['fleet']);
  assert.deepEqual(plain(api.FUNCTION_GROUPS.flatMap(x=>x.items.filter(i=>i.minRole).map(i=>[i.page,i.minRole]))),[['fuel','owner_op'],['service','owner_op'],['deductions','owner_op']]);
});
test('UNIT_CONTRACT rank, parity, bottom destinations, invalid role remain exact',()=>{
  assert.deepEqual(plain(api.ROLE_RANK),{driver:0,owner_op:1,fleet:2});
  for(const role of Object.keys(roleOrder)) assert.deepEqual([...new Set(api.roleMenuTargets(role))].sort(),[...new Set(api.groupedTargets(role))].sort());
  assert.deepEqual(plain(api.bottomDestinationsForRole('driver')),['home','work','truck','money']);
  assert.deepEqual(plain(api.bottomDestinationsForRole('owner_op')),['home','work','truck','money']);
  assert.deepEqual(plain(api.bottomDestinationsForRole('fleet')),['home','work','team','money']);
  assert.equal(api.roleConfig('stale').label,'Driver');assert.deepEqual(plain(api.groupedTargets('stale')),groupOrder.driver);
});
test('UNIT_CONTRACT Links, Marketplace and technical containers remain exact',()=>{
  for(const role of Object.keys(roleOrder)) assert.ok(api.roleMenuTargets(role).includes('community'));
  assert.equal(api.PAGE_REGISTRY.marketplace.classification,'ORPHANED');
  for(const p of ['work','truck','money','team','community','menu']) assert.equal(api.PAGE_REGISTRY[p].technicalContainer,true);
  assert.equal(api.primaryDestinationForPage('pti','fleet'),'team');assert.match(html,/links:'community'/);
});
test('STATIC_CONTRACT load order, globals and single model definitions remain',()=>{
  assert.ok(html.indexOf('navigation-model.js?v=20260830-slice3b-v1')<html.indexOf('var ROLE_CONFIG = CrewBIQNavigationModel.ROLE_CONFIG'));
  assert.match(html,/var ROLE_CONFIG = CrewBIQNavigationModel\.ROLE_CONFIG;/);assert.match(html,/var FUNCTION_GROUPS = CrewBIQNavigationModel\.FUNCTION_GROUPS;/);
  assert.doesNotMatch(html,/const ROLE_CONFIG = \{/);assert.doesNotMatch(html,/const FUNCTION_GROUPS = \[/);
  assert.equal((source.match(/const ROLE_CONFIG = \{/g)||[]).length,1);assert.equal((source.match(/const FUNCTION_GROUPS = \[/g)||[]).length,1);
});
test('UNIT_CONTRACT core role guard wraps the single effective setter',()=>{
  const level=core.match(/function roleLevel\(role\) \{[\s\S]*?\n  \}/)?.[0];
  const authorized=core.match(/function authorizedUiRole\(roles\) \{[\s\S]*?\n  \}/)?.[0];
  const install=core.match(/function installRoleGuard\(\) \{[\s\S]*?\n  \}/)?.[0];assert.ok(level&&authorized&&install);
  const calls=[];const context={K:'fiqD_',global:{setUserRole:r=>calls.push(`set:${r}`)},localStorage:{getItem:()=> '["driver"]'},toast:m=>calls.push(`toast:${m}`)};
  vm.runInNewContext(`${level}\n${authorized}\n${install}\ninstallRoleGuard();`,context);assert.equal(context.global.setUserRole.__crewbiqGuarded,true);
  context.global.setUserRole('fleet');context.global.setUserRole('driver');assert.deepEqual(calls,['toast:This role is not authorized for the signed-in account.','set:driver']);
  assert.equal((html.match(/function setUserRole\(role\)/g)||[]).length,1);assert.doesNotMatch(source,/setUserRole/);assert.match(core,/DOMContentLoaded'[\s\S]*?installRoleGuard\(\)/);
});
test('UNIT_CONTRACT invalid page fallback and showPage ownership remain',()=>{
  const fn=html.match(/function showPage\(name, btn, options\)\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);const activated=[];const calls=[];
  const pages={home:{classList:{remove(){},add(){activated.push('home')}}},menu:{classList:{remove(){},add(){activated.push('menu')}}}};
  const context={currentPageName:'home',pageNavigationHistory:[],PRIMARY_NAV_PAGES:['home','work','truck','team','money'],activePageName:()=> 'home',primaryDestinationForPage:()=>'',document:{querySelectorAll:s=>s==='.page'?Object.values(pages):[],getElementById:id=>pages[id.replace('page-','')]||null,querySelector:()=>null},applyRoleUI:()=>calls.push('menu'),updatePageBackNavigation:n=>calls.push(n)};
  for(const n of ['renderHome','renderPTIPage','renderStats','renderFleetStats','renderSettingsPage','renderLoadPage','renderDriverDisputedPage','renderFuelPage','renderDeductionsPage','renderServicePage','renderFleetPage','renderDriversPage','renderMarketplace','renderCommunity','renderExpenses','renderScanReview']) context[n]=()=>{};
  vm.runInNewContext(fn,context);context.showPage('invalid');assert.deepEqual(activated,['menu']);assert.deepEqual(calls,['menu','menu']);
  assert.equal((html.match(/function showPage\(/g)||[]).length,1);assert.doesNotMatch(source,/function showPage|querySelector|getElementById|classList/);
});
