import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../links.js', import.meta.url), 'utf8');

function setup(initial = {}) {
  const values = new Map(Object.entries(initial));
  const elements = {
    communityCustomLinks: { innerHTML: '' }, lmSearch: { value: '' }, lm_modal_backdrop: { style: {} },
    lm_id: { value: '' }, lm_name: { value: '' }, lm_url: { value: '' }, lm_category: { value: 'other' },
    lm_note: { value: '' }, lm_favorite: { checked: false },
  };
  const context = vm.createContext({ window: {}, globalThis: {} });
  vm.runInContext(source, context);
  const api = context.window.CrewBIQLinks.create({
    K: 'fiqD_', URL, confirm: () => true, console,
    document: { body: { appendChild() {} }, createElement: () => ({}), getElementById: id => elements[id] || null },
    escHtml: value => String(value == null ? '' : value).replaceAll('"', '&quot;'),
    localStorage: { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) },
    now: () => 1, random: () => 0.5, setTimeout: callback => callback(), toast() {},
  });
  return { api, elements, snapshot: key => values.get(key) };
}

test('UNIT_CONTRACT accepted URL policy is unchanged', () => {
  const { api } = setup();
  for (const value of ['https://example.com', 'http://example.com', 'mailto:a@example.com', 'tg://resolve?domain=a', 'HTTPS://example.com', 'MailTo:a@example.com', 'TG://resolve?domain=a']) assert.equal(api.normalizeLinkUrl(value), value);
  assert.equal(api.normalizeLinkUrl('example.com/path'), 'https://example.com/path');
  for (const value of ['javascript:x', 'data:x', 'file:x', 'vbscript:x', 'blob:x', 'chrome:x', 'about:x', 'custom:x', '', ' ']) assert.equal(api.normalizeLinkUrl(value), '');
});

test('UNIT_CONTRACT blank save is rejected', () => {
  const state = setup({ fiqD_clinks: '[]' });
  state.elements.lm_name.value = 'Name';
  state.elements.lm_url.value = ' ';
  state.api.handleSaveLink({ preventDefault() {} });
  assert.equal(state.snapshot('fiqD_clinks'), '[]');
});

test('UNIT_CONTRACT unsafe legacy remains stored and non-clickable', () => {
  const record = { id: 'u', name: 'Unsafe', url: 'javascript:x', category: 'other', note: '', favorite: false };
  const state = setup({ fiqD_clinks: JSON.stringify([record]) });
  state.api.renderCommunity();
  assert.equal(JSON.parse(state.snapshot('fiqD_clinks'))[0].url, 'javascript:x');
  assert.doesNotMatch(state.elements.communityCustomLinks.innerHTML, /href="javascript:/i);
  assert.match(state.elements.communityCustomLinks.innerHTML, /Unavailable/);
});

test('UNIT_CONTRACT valid link remains clickable with opener protection', () => {
  const record = { id: 'v', name: 'Valid', url: 'https://example.com', category: 'other', note: '', favorite: false };
  const state = setup({ fiqD_clinks: JSON.stringify([record]) });
  state.api.renderCommunity();
  assert.match(state.elements.communityCustomLinks.innerHTML, /href="https:\/\/example\.com"/);
  assert.match(state.elements.communityCustomLinks.innerHTML, /rel="noopener noreferrer"/);
});
