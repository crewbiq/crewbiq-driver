import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../links.js', import.meta.url), 'utf8');

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), snapshot: k => map.get(k) };
}

function runtime(store, confirmResult = true) {
  const toasts = [];
  const elements = {
    communityCustomLinks: { innerHTML: '' }, lmSearch: { value: '' }, lm_modal_backdrop: { style: {} },
    lm_id: { value: '' }, lm_name: { value: '' }, lm_url: { value: '' }, lm_category: { value: 'other' },
    lm_note: { value: '' }, lm_favorite: { checked: false },
  };
  const context = vm.createContext({ window: {}, globalThis: {} });
  vm.runInContext(source, context, { filename: 'links.js' });
  const api = context.window.CrewBIQLinks.create({
    K: 'fiqD_', URL, confirm: () => confirmResult, console,
    document: { body: { appendChild() {} }, createElement: () => ({}), getElementById: id => elements[id] || null },
    escHtml: value => String(value == null ? '' : value).replaceAll('"', '&quot;'),
    localStorage: store, now: () => 100, random: () => 0.5, setTimeout: callback => callback(),
    toast: (...args) => toasts.push(args),
  });
  return { api, elements, toasts };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('UNIT_CONTRACT links.js parses independently and exports namespace', () => {
  assert.equal(typeof runtime(storage()).api.loadCLinks, 'function');
});

test('UNIT_CONTRACT default creation and non-array coercion retain behavior', () => {
  const empty = storage();
  const defaults = plain(runtime(empty).api.loadCLinks());
  assert.deepEqual(defaults.map(record => record.id), ['def-1', 'def-2']);
  assert.deepEqual(JSON.parse(empty.snapshot('fiqD_clinks')), defaults);
  const raw = JSON.stringify({ unexpected: true });
  const malformed = storage({ fiqD_clinks: raw });
  assert.deepEqual(plain(runtime(malformed).api.loadCLinks()), []);
  assert.equal(malformed.snapshot('fiqD_clinks'), raw);
});

test('UNIT_CONTRACT reload and wrong-key legacy migration retain behavior', () => {
  const records = [{ id: 'p', name: 'P', url: 'https://p.example', category: 'other', favorite: false }];
  const persisted = storage({ fiqD_clinks: JSON.stringify(records) });
  assert.deepEqual(plain(runtime(persisted).api.loadCLinks()), records);
  assert.deepEqual(plain(runtime(persisted).api.loadCLinks()), records);
  const legacy = storage({ fiqD__clinks: JSON.stringify([{ name: 'Legacy', url: 'dispatch.example' }]) });
  const migrated = plain(runtime(legacy).api.loadCLinks());
  assert.equal(migrated[0].name, 'Legacy');
  assert.equal(migrated[0].url, 'https://dispatch.example');
  assert.equal(legacy.snapshot('fiqD__clinks'), undefined);
});

test('UNIT_CONTRACT add/edit/delete/favorite and missing-id success retain behavior', () => {
  const store = storage({ fiqD_clinks: '[]' });
  const add = runtime(store);
  add.elements.lm_name.value = 'Accounting';
  add.elements.lm_url.value = 'accounting.example';
  add.elements.lm_category.value = 'accounting';
  add.api.handleSaveLink({ preventDefault() {} });
  let records = JSON.parse(store.snapshot('fiqD_clinks'));
  assert.equal(records.length, 1);
  const id = records[0].id;
  records.push({ id: 'keep', name: 'Keep', url: 'https://keep.example', category: 'other', note: '', favorite: false, createdAt: 2 });
  store.setItem('fiqD_clinks', JSON.stringify(records));
  const edit = runtime(store);
  edit.elements.lm_id.value = id;
  edit.elements.lm_name.value = 'Updated';
  edit.elements.lm_url.value = 'https://updated.example';
  edit.elements.lm_category.value = 'dispatch';
  edit.api.handleSaveLink({ preventDefault() {} });
  records = JSON.parse(store.snapshot('fiqD_clinks'));
  assert.equal(records[0].name, 'Updated');
  assert.equal(records[1].name, 'Keep');
  runtime(store).api.toggleLinkFav('keep');
  assert.equal(JSON.parse(store.snapshot('fiqD_clinks'))[1].favorite, true);
  runtime(store).api.deleteLink(id);
  assert.deepEqual(JSON.parse(store.snapshot('fiqD_clinks')).map(record => record.id), ['keep']);
  const missing = runtime(store);
  missing.api.deleteLink('missing');
  assert.deepEqual(missing.toasts.at(-1), ['Link deleted']);
});

test('UNIT_CONTRACT filters/search/categories and all-role visibility remain', () => {
  const store = storage({ fiqD_clinks: JSON.stringify([
    { id: 'd', name: 'Dispatch', url: 'https://d.example', category: 'dispatch', note: '', favorite: true },
    { id: 'a', name: 'Accounting', url: 'https://a.example', category: 'accounting', note: 'invoice', favorite: false },
  ]) });
  const state = runtime(store);
  assert.ok(state.api.LINK_CATEGORIES.community);
  state.api.setFilter('favorites');
  state.api.renderCommunity();
  assert.match(state.elements.communityCustomLinks.innerHTML, /Dispatch/);
  assert.doesNotMatch(state.elements.communityCustomLinks.innerHTML, /lm-card-name\">Accounting</);
  state.api.setFilter('all');
  state.api.setSearchQuery('invoice');
  state.api.renderCommunity();
  assert.match(state.elements.communityCustomLinks.innerHTML, />Accounting</);

  const start = html.indexOf('const ROLE_CONFIG = {');
  const end = html.indexOf('function getUserRole()', start);
  const context = vm.createContext({});
  vm.runInContext(html.slice(start, end), context);
  const roles = JSON.parse(vm.runInContext('JSON.stringify(ROLE_CONFIG)', context));
  for (const role of ['driver', 'owner_op', 'fleet']) assert.ok(roles[role].menu.some(item => item.page === 'community' && item.label === 'Links'));
});

test('STATIC_CONTRACT shell/route/load position/shims remain without duplicate runtime', () => {
  assert.match(html, /id="page-community"\s+class="page"/);
  assert.match(html, /if\(name==='community'\) renderCommunity\(\);/);
  assert.match(html, /startup-session\.js[^>]*><\/script>\s*<script src="links\.js/);
  for (const name of ['renderCommunity', 'openLinkModal', 'closeLinkModal', 'handleSaveLink', 'toggleLinkFav', 'deleteLink']) {
    assert.match(html, new RegExp('function ' + name + '\\([^)]*\\)\\{ return getLinksRuntime\\(\\)\\.' + name));
  }
  assert.doesNotMatch(html, /const LINK_CATEGORIES\s*=/);
  assert.doesNotMatch(html, /let currentLinkFilter\s*=/);
  assert.doesNotMatch(source, /mktModules|MKT_MODULES|saveMktModules|loadMktModules/);
  assert.match(html, /const map=\{expenses:'expenses',links:'community'/);
});
