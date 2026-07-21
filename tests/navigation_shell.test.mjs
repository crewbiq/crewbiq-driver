import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('primary navigation exposes task domains and a global add action', () => {
  assert.match(html, /data-page="home"[^>]*>[\s\S]*?Today/);
  assert.match(html, /data-page="work"[^>]*>[\s\S]*?Work/);
  assert.match(html, /id="globalAddButton"[^>]*openQuickAdd\(\)/);
  assert.match(html, /data-page="truck"[^>]*data-role-nav="truck"/);
  assert.match(html, /data-page="team"[^>]*data-role-nav="team"/);
  assert.match(html, /data-page="money"[^>]*>[\s\S]*?Money/);
});

test('domain hubs preserve existing workflow pages', () => {
  for (const page of ['work', 'truck', 'money', 'team']) {
    assert.match(html, new RegExp(`id="page-${page}" class="page"`));
  }
  for (const existingPage of ['load', 'disputes', 'pti', 'fuel', 'service', 'expenses', 'report', 'stats', 'fleet', 'drivers', 'settings', 'scan']) {
    assert.match(html, new RegExp(`showPage\\('${existingPage}'\\)`));
  }
});

test('functions have one clear domain and the legacy menu uses the same groups', () => {
  const hubs = html.slice(html.indexOf('id="page-work"'), html.indexOf('<!-- MENU / MODULES -->'));
  assert.equal((hubs.match(/showPage\('scan'\)/g) || []).length, 1, 'Documents should belong to Work only');
  assert.doesNotMatch(hubs, /Quick Access/);
  assert.match(html, /const FUNCTION_GROUPS = \[/);
  for (const group of ['Work', 'Truck', 'Money', 'Team', 'Resources & account']) {
    assert.match(html, new RegExp(`label:'${group.replace('&', '&')}'`));
  }
  assert.match(html, /data-function-group="\$\{group\.label\}"/);
});

test('role adaptation swaps Truck and Team and filters owner actions', () => {
  assert.match(html, /truckNav\.style\.display = role === 'fleet' \? 'none' : ''/);
  assert.match(html, /teamNav\.style\.display = role === 'fleet' \? '' : 'none'/);
  assert.match(html, /const roleRank = \{driver:0, owner_op:1, fleet:2\}/);
  assert.match(html, /data-min-role="owner_op"/);
  assert.match(html, /getUserRole\(\)==='fleet' \? 'team' : 'truck'/);
});

test('account and quick add remain keyboard reachable', () => {
  assert.match(html, /id="accountButton"[^>]*showPage\('settings'\)/);
  assert.match(html, /id="quickAddOverlay"[^>]*aria-hidden="true"/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /quickAddPage\('expenses'\)/);
  assert.match(html, /quickAddPage\('scan'\)/);
  assert.match(html, /quickAddPTI\(\)/);
});
