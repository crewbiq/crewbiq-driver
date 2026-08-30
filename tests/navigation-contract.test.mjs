import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function navigationModels() {
  const roleMatch = html.match(/const ROLE_CONFIG = \{[\s\S]*?\n\};\r?\n\r?\n\['driver','owner_op','fleet'\]\.forEach\(function\(role\)\{[\s\S]*?\n\}\);/);
  const groupsMatch = html.match(/const FUNCTION_GROUPS = \[[\s\S]*?\n\];/);
  assert.ok(roleMatch, 'ROLE_CONFIG and its scan insertion must remain executable');
  assert.ok(groupsMatch, 'FUNCTION_GROUPS must remain executable');
  const roles = vm.runInNewContext(roleMatch[0].replace('const ROLE_CONFIG', 'var ROLE_CONFIG') + '\nROLE_CONFIG;');
  const groups = vm.runInNewContext(groupsMatch[0].replace('const FUNCTION_GROUPS', 'var FUNCTION_GROUPS') + '\nFUNCTION_GROUPS;');
  return { roles: plain(roles), groups: plain(groups) };
}

const { roles, groups } = navigationModels();
const rank = { driver: 0, owner_op: 1, fleet: 2 };

function groupedTargets(role) {
  return groups
    .filter(group => !group.roles || group.roles.includes(role))
    .flatMap(group => group.items.filter(item => !item.minRole || rank[role] >= rank[item.minRole]).map(item => item.page));
}

const expectedRoleOrder = {
  driver: ['load', 'report', 'expenses', 'scan', 'disputes', 'pti', 'stats', 'community', 'settings'],
  owner_op: ['load', 'report', 'expenses', 'scan', 'fuel', 'deductions', 'service', 'disputes', 'pti', 'stats', 'community', 'settings'],
  fleet: ['load', 'fleet', 'drivers', 'report', 'expenses', 'scan', 'fuel', 'deductions', 'service', 'disputes', 'pti', 'stats', 'community', 'settings'],
};

const expectedGroupedOrder = {
  driver: ['load', 'disputes', 'scan', 'pti', 'expenses', 'report', 'stats', 'community', 'settings'],
  owner_op: ['load', 'disputes', 'scan', 'pti', 'fuel', 'service', 'expenses', 'report', 'stats', 'deductions', 'community', 'settings'],
  fleet: ['load', 'disputes', 'scan', 'pti', 'fuel', 'service', 'expenses', 'report', 'stats', 'deductions', 'fleet', 'drivers', 'community', 'settings'],
};

for (const role of ['driver', 'owner_op', 'fleet']) {
  test(`UNIT_CONTRACT ${role} visible pages remain exact`, () => {
    assert.deepEqual(roles[role].menu.map(item => item.page), expectedRoleOrder[role]);
    assert.deepEqual(groupedTargets(role), expectedGroupedOrder[role]);
  });
}

test('UNIT_CONTRACT FUNCTION_GROUPS ordering, restrictions, labels, and icons remain exact', () => {
  assert.deepEqual(groups.map(group => group.label), ['Work', 'Truck', 'Money', 'Team', 'Resources & account']);
  assert.deepEqual(groups.map(group => group.items.map(item => `${item.page}:${item.label}:${item.icon}:${item.minRole || ''}`)), [
    ['load:Loads:📦:', 'disputes:Exceptions:⚖️:', 'scan:Documents:📄:'],
    ['pti:Inspections:🔍:', 'fuel:Fuel:⛽:owner_op', 'service:Maintenance:🔧:owner_op'],
    ['expenses:Expenses:💳:', 'report:Reports:📄:', 'stats:Performance:📈:', 'deductions:Deductions:💰:owner_op'],
    ['fleet:Fleet overview:🚚:', 'drivers:Drivers:👥:'],
    ['community:Links:🔗:', 'settings:Settings:⚙️:'],
  ]);
  assert.deepEqual(groups.find(group => group.label === 'Team').roles, ['fleet']);
});

test('UNIT_CONTRACT ROLE_CONFIG ordering and role metadata remain exact', () => {
  assert.deepEqual(Object.keys(roles), ['driver', 'owner_op', 'fleet']);
  assert.deepEqual(Object.values(roles).map(role => `${role.label}:${role.icon}`), ['Driver:🚛', 'Owner-Op:🏢', 'Fleet:🚚']);
  for (const role of Object.keys(expectedRoleOrder)) assert.deepEqual(roles[role].menu.map(item => item.page), expectedRoleOrder[role]);
});

test('UNIT_CONTRACT role-menu target drift is detectable while independent ordering remains', () => {
  for (const role of Object.keys(expectedRoleOrder)) {
    assert.deepEqual([...new Set(groupedTargets(role))].sort(), [...new Set(roles[role].menu.map(item => item.page))].sort(), `${role} target sets drifted`);
  }
  assert.notDeepEqual(groupedTargets('driver'), expectedRoleOrder.driver, 'independent order must not be silently unified');
});

test('STATIC_CONTRACT Links remains reachable and Marketplace does not own it', () => {
  for (const role of Object.keys(expectedRoleOrder)) assert.ok(roles[role].menu.some(item => item.page === 'community'));
  assert.ok(groups.some(group => group.items.some(item => item.page === 'community' && item.label === 'Links')));
  assert.match(html, /const map=\{expenses:'expenses',links:'community',reports:'report',pti:'pti',fuel:'expenses'\}/);
  assert.doesNotMatch(JSON.stringify({ roles, groups }), /"page":"marketplace"/);
});

test('STATIC_CONTRACT active technical containers and the orphaned Marketplace are explicit', () => {
  const pageIds = [...html.matchAll(/id="page-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(pageIds, ['home', 'load', 'pti', 'stats', 'settings', 'report', 'disputes', 'fuel', 'deductions', 'service', 'fleet', 'drivers', 'marketplace', 'community', 'expenses', 'scan', 'work', 'truck', 'money', 'team', 'menu']);
  for (const page of ['work', 'truck', 'money', 'team', 'menu', 'community']) assert.ok(pageIds.includes(page));
  const modelTargets = new Set([...Object.values(roles).flatMap(role => role.menu.map(item => item.page)), ...groups.flatMap(group => group.items.map(item => item.page))]);
  assert.equal(modelTargets.has('marketplace'), false);
  assert.match(html, /id="page-marketplace"[\s\S]*?function renderMarketplace\(\)/);
});

test('STATIC_CONTRACT showPage render hooks for major active domains remain exact', () => {
  const hooks = {
    home: 'renderHome', pti: 'renderPTIPage', settings: 'renderSettingsPage\\(true\\)', load: 'renderLoadPage',
    disputes: 'renderDriverDisputedPage', fuel: 'renderFuelPage', deductions: 'renderDeductionsPage', service: 'renderServicePage',
    fleet: 'renderFleetPage', drivers: 'renderDriversPage', marketplace: 'renderMarketplace', community: 'renderCommunity',
    expenses: 'renderExpenses', scan: 'renderScanReview', menu: 'applyRoleUI',
  };
  for (const [page, hook] of Object.entries(hooks)) assert.match(html, new RegExp(`if\\(name==='${page}'\\)[^\\n]*${hook}`));
  assert.match(html, /if\(name==='stats'\)\{ renderStats\(\); renderFleetStats\(\); \}/);
  assert.match(html, /if\(name==='report'\)\{\}/);
});

test('UNIT_CONTRACT invalid page falls back to menu and invokes its render/update hooks', () => {
  const showPageMatch = html.match(/function showPage\(name, btn, options\)\{[\s\S]*?\n\}/);
  assert.ok(showPageMatch);
  const activated = [];
  const pages = {
    home: { id: 'page-home', classList: { remove() {}, add() { activated.push('home'); } } },
    menu: { id: 'page-menu', classList: { remove() {}, add() { activated.push('menu'); } } },
  };
  const calls = [];
  const context = {
    currentPageName: 'home', pageNavigationHistory: [], PRIMARY_NAV_PAGES: ['home', 'work', 'truck', 'team', 'money'],
    activePageName: () => 'home', primaryDestinationForPage: () => '',
    document: {
      querySelectorAll: selector => selector === '.page' ? Object.values(pages) : [],
      getElementById: id => pages[id.replace('page-', '')] || null,
      querySelector: () => null,
    },
    applyRoleUI: () => calls.push('applyRoleUI'), updatePageBackNavigation: name => calls.push(`back:${name}`),
    renderHome() {}, renderPTIPage() {}, renderStats() {}, renderFleetStats() {}, renderSettingsPage() {}, renderLoadPage() {},
    renderDriverDisputedPage() {}, renderFuelPage() {}, renderDeductionsPage() {}, renderServicePage() {}, renderFleetPage() {},
    renderDriversPage() {}, renderMarketplace() {}, renderCommunity() {}, renderExpenses() {}, renderScanReview() {},
  };
  vm.runInNewContext(showPageMatch[0], context);
  context.showPage('not-a-page');
  assert.deepEqual(activated, ['menu']);
  assert.deepEqual(calls, ['applyRoleUI', 'back:menu']);
  assert.equal(context.currentPageName, 'menu');
});

test('STATIC_CONTRACT showPage remains UI routing without role or browser-history enforcement', () => {
  const body = html.match(/function showPage\(name, btn, options\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(body, /getUserRole|ROLE_CONFIG|history\.|pushState|replaceState|scrollTo/);
  assert.match(body, /pageNavigationHistory\.push\(previousPage\)/);
  assert.match(body, /updatePageBackNavigation\(name\)/);
});

