import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const linksStart = html.indexOf("let currentLinkFilter = 'all';");
const linksEnd = html.indexOf('function shareInvite(){', linksStart);
assert.notEqual(linksStart, -1, 'Links runtime start marker missing');
assert.notEqual(linksEnd, -1, 'Links runtime end marker missing');
const linksSource = html.slice(linksStart, linksEnd);

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: key => values.get(key),
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createRuntime(storage, confirmResult = true) {
  const elements = {
    communityCustomLinks: { innerHTML: '' },
    lmSearch: { value: '' },
    lm_modal_backdrop: { style: {} },
    lm_id: { value: '' },
    lm_name: { value: '' },
    lm_url: { value: '' },
    lm_category: { value: 'other' },
    lm_note: { value: '' },
    lm_favorite: { checked: false },
  };
  const context = vm.createContext({
    K: 'fiqD_',
    URL,
    confirm: () => confirmResult,
    console,
    document: {
      body: { appendChild() {} },
      createElement: () => ({ style: {}, className: '', innerHTML: '' }),
      getElementById: id => elements[id] || null,
    },
    escHtml: escapeHtml,
    localStorage: storage,
    setTimeout: callback => callback(),
    toast() {},
  });
  vm.runInContext(linksSource, context, { filename: 'index-links-contract.js' });
  return { context, elements };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('UNIT_CONTRACT persisted Links survive independent reload/load contexts', () => {
  const records = [{
    id: 'persisted-1',
    name: 'Dispatch',
    url: 'https://dispatch.example',
    category: 'dispatch',
    note: 'Desk 4',
    favorite: true,
    createdAt: 10,
  }];
  const storage = createStorage({ fiqD_clinks: JSON.stringify(records) });
  assert.deepEqual(plain(createRuntime(storage).context.loadCLinks()), records);
  assert.deepEqual(plain(createRuntime(storage).context.loadCLinks()), records);
});

test('UNIT_CONTRACT wrong-key and legacy-shape migration preserve legacy name and URL', () => {
  const storage = createStorage({
    fiqD__clinks: JSON.stringify([{ name: 'Legacy dispatch', url: 'dispatch.example/path' }]),
  });
  const migrated = plain(createRuntime(storage).context.loadCLinks());
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, 'Legacy dispatch');
  assert.equal(migrated[0].url, 'https://dispatch.example/path');
  assert.equal(migrated[0].category, 'other');
  assert.equal(migrated[0].favorite, false);
  assert.match(migrated[0].id, /^lnk-/);
  assert.equal(storage.snapshot('fiqD__clinks'), undefined);
  assert.deepEqual(JSON.parse(storage.snapshot('fiqD_clinks')), migrated);
});

test('UNIT_CONTRACT add creates exactly one record', () => {
  const storage = createStorage({ fiqD_clinks: '[]' });
  const runtime = createRuntime(storage);
  runtime.elements.lm_name.value = 'Accounting';
  runtime.elements.lm_url.value = 'accounting.example';
  runtime.elements.lm_category.value = 'accounting';
  runtime.elements.lm_note.value = 'Extension 4';
  runtime.elements.lm_favorite.checked = true;
  runtime.context.handleSaveLink({ preventDefault() {} });
  const records = JSON.parse(storage.snapshot('fiqD_clinks'));
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'Accounting');
  assert.equal(records[0].url, 'https://accounting.example');
  assert.equal(records[0].category, 'accounting');
  assert.equal(records[0].note, 'Extension 4');
  assert.equal(records[0].favorite, true);
});

test('UNIT_CONTRACT edit updates only the intended record', () => {
  const records = [
    { id: 'a', name: 'A', url: 'https://a.example', category: 'other', note: '', favorite: false, createdAt: 1 },
    { id: 'b', name: 'B', url: 'https://b.example', category: 'other', note: '', favorite: false, createdAt: 2 },
  ];
  const storage = createStorage({ fiqD_clinks: JSON.stringify(records) });
  const runtime = createRuntime(storage);
  runtime.elements.lm_id.value = 'b';
  runtime.elements.lm_name.value = 'B updated';
  runtime.elements.lm_url.value = 'https://updated.example';
  runtime.elements.lm_category.value = 'dispatch';
  runtime.context.handleSaveLink({ preventDefault() {} });
  const saved = JSON.parse(storage.snapshot('fiqD_clinks'));
  assert.deepEqual(saved[0], records[0]);
  assert.equal(saved[1].id, 'b');
  assert.equal(saved[1].name, 'B updated');
  assert.equal(saved[1].url, 'https://updated.example');
  assert.equal(saved[1].createdAt, 2);
});

test('UNIT_CONTRACT delete removes only the intended record', () => {
  const records = [
    { id: 'a', name: 'A', url: 'https://a.example', category: 'other', favorite: false },
    { id: 'b', name: 'B', url: 'https://b.example', category: 'other', favorite: false },
  ];
  const storage = createStorage({ fiqD_clinks: JSON.stringify(records) });
  createRuntime(storage).context.deleteLink('a');
  assert.deepEqual(JSON.parse(storage.snapshot('fiqD_clinks')), [records[1]]);
});

test('UNIT_CONTRACT Links are visible in every current role configuration', () => {
  const start = html.indexOf('const ROLE_CONFIG = {');
  const end = html.indexOf('function getUserRole()', start);
  const context = vm.createContext({});
  vm.runInContext(html.slice(start, end), context);
  const roles = JSON.parse(vm.runInContext('JSON.stringify(ROLE_CONFIG)', context));
  for (const role of ['driver', 'owner_op', 'fleet']) {
    assert.ok(roles[role].menu.some(item => item.page === 'community' && item.label === 'Links'));
  }
  const groups = JSON.parse(vm.runInContext('JSON.stringify(FUNCTION_GROUPS)', context));
  assert.ok(groups.some(group => group.items.some(item => item.page === 'community' && item.label === 'Links')));
});

test('STATIC_CONTRACT current Links container and route remain reachable', () => {
  assert.match(html, /id="page-community"\s+class="page"/);
  assert.match(html, /if\(name==='community'\) renderCommunity\(\);/);
  assert.match(html, /\{page:'community',\s*icon:'🔗',\s*label:'Links'\}/);
});

test('STATIC_CONTRACT Links storage is independent from Community and Marketplace concepts', () => {
  const storage = createStorage();
  assert.equal(createRuntime(storage).context.getLinksKey(), 'fiqD_clinks');
  assert.doesNotMatch(linksSource, /mktModules|MKT_MODULES|saveMktModules|loadMktModules/);
  assert.match(html, /const map=\{expenses:'expenses',links:'community'/);
});
