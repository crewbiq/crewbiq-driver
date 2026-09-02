import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coordinator = fs.readFileSync(new URL('../startup-session.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, 'missing start marker: ' + start);
  assert.notEqual(endAt, -1, 'missing end marker: ' + end);
  return source.slice(startAt, endAt);
}

test('all executable inline scripts in index.html parse successfully', () => {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]))
    .filter(match => !/\btype\s*=\s*["']application\/(?:json|ld\+json)["']/i.test(match[1]));
  assert.ok(scripts.length > 0, 'expected at least one executable inline script');
  scripts.forEach((match, index) => {
    assert.doesNotThrow(
      () => new vm.Script(match[2], { filename: 'index-inline-' + index + '.js' }),
      'inline script ' + index + ' must parse',
    );
  });
});

test('index contains one restoreSession compatibility shim and no stale implementation', () => {
  assert.equal(html.match(/function restoreSession\(options=\{\}\)/g)?.length, 1);
  assert.match(
    html,
    /function restoreSession\(options=\{\}\)\{\s*return getStartupCoordinator\(\)\.restoreSession\(options\);\s*\}/,
  );
  assert.doesNotMatch(
    html,
    /function restoreSession\(options=\{\}\)[\s\S]*?setFleetRestoreSettled\(false\)/,
  );
});

test('startup coordinator is the single owner of PTI and showApp routing', () => {
  const shell = section(html, 'function renderStartupShell(){', 'function boot(){');
  assert.doesNotMatch(shell, /needsPTI|showPTIBlocker|showApp/);
  const boot = section(coordinator, 'function boot() {', 'function start() {');
  assert.equal(boot.match(/deps\.needsPTI\(\)/g)?.length, 1);
  assert.equal(boot.match(/deps\.showPTIBlocker\(\)/g)?.length, 1);
  assert.equal(boot.match(/showApp\(\)/g)?.length, 1);
});
