import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("let currentLinkFilter = 'all';");
const end = html.indexOf('function shareInvite(){', start);
assert.notEqual(start, -1, 'Links runtime start marker missing');
assert.notEqual(end, -1, 'Links runtime end marker missing');
const linksSource = html.slice(start, end);

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

function createRuntime(initial = {}) {
  const storage = createStorage(initial);
  const toasts = [];
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
    URL,
    confirm: () => true,
    console,
    document: {
      body: { appendChild() {} },
      createElement: () => ({ style: {}, className: '', innerHTML: '' }),
      getElementById: id => elements[id] || null,
    },
    escHtml: escapeHtml,
    localStorage: storage,
    setTimeout: callback => callback(),
    toast: (...args) => toasts.push(args),
  });
  vm.runInContext(linksSource, context, { filename: 'index-links-runtime.js' });
  return { context, elements, storage, toasts };
}

test('UNIT_CONTRACT allows supported URL schemes and normalizes bare domains', () => {
  const { context } = createRuntime();
  assert.equal(context.normalizeLinkUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(context.normalizeLinkUrl('http://example.com'), 'http://example.com');
  assert.equal(context.normalizeLinkUrl('example.com/path'), 'https://example.com/path');
  assert.equal(context.normalizeLinkUrl('mailto:dispatch@example.com'), 'mailto:dispatch@example.com');
  assert.equal(context.normalizeLinkUrl('tg://resolve?domain=CrewBIQSupport_bot'), 'tg://resolve?domain=CrewBIQSupport_bot');
});

test('UNIT_CONTRACT rejects executable, local, unknown, and blank URL inputs', () => {
  const { context } = createRuntime();
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///tmp/secret',
    'vbscript:msgbox(1)',
    'blob:https://example.com/id',
    'chrome://settings',
    'about:blank',
    'custom-scheme://value',
    '',
    '   ',
  ]) {
    assert.equal(context.normalizeLinkUrl(value), '', value + ' must be rejected');
  }
});

test('UNIT_CONTRACT blank form URL is rejected and never saved as hash', () => {
  const runtime = createRuntime({ fiqD_clinks: '[]' });
  runtime.elements.lm_name.value = 'Dispatch';
  runtime.elements.lm_url.value = '   ';
  runtime.context.handleSaveLink({ preventDefault() {} });
  assert.equal(runtime.storage.snapshot('fiqD_clinks'), '[]');
  assert.deepEqual(runtime.toasts[0], ['Name and URL required', 'err']);
});

test('UNIT_CONTRACT unsafe persisted legacy URL remains stored but is not clickable', () => {
  const record = {
    id: 'legacy-unsafe',
    name: 'Legacy unsafe',
    url: 'javascript:alert(1)',
    category: 'other',
    note: '',
    favorite: false,
    createdAt: 1,
  };
  const runtime = createRuntime({ fiqD_clinks: JSON.stringify([record]) });
  runtime.context.renderCommunity();
  const persisted = JSON.parse(runtime.storage.snapshot('fiqD_clinks'));
  assert.equal(persisted[0].url, 'javascript:alert(1)');
  assert.doesNotMatch(runtime.elements.communityCustomLinks.innerHTML, /href="javascript:/i);
  assert.match(runtime.elements.communityCustomLinks.innerHTML, /Unavailable/);
});

test('UNIT_CONTRACT valid persisted link remains clickable with opener protection', () => {
  const record = {
    id: 'valid-link',
    name: 'Dispatch',
    url: 'https://dispatch.example/path',
    category: 'dispatch',
    note: '',
    favorite: false,
    createdAt: 1,
  };
  const runtime = createRuntime({ fiqD_clinks: JSON.stringify([record]) });
  runtime.context.renderCommunity();
  assert.match(runtime.elements.communityCustomLinks.innerHTML, /href="https:\/\/dispatch\.example\/path"/);
  assert.match(runtime.elements.communityCustomLinks.innerHTML, /rel="noopener noreferrer"/);
});
