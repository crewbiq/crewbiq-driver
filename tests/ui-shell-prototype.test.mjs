import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('prototype/crewbiq-next/index.html');
const css = read('prototype/crewbiq-next/styles.css');
const app = read('prototype/crewbiq-next/app.js');
const hash = path => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex').toUpperCase();

test('STATIC_CONTRACT prototype files parse and compose as an isolated static shell', () => {
  new vm.Script(app, { filename: 'prototype/crewbiq-next/app.js' });
  assert.match(html, /\.\.\/\.\.\/navigation-model\.js/);
  assert.match(html, /styles\.css/);
  assert.match(html, /app\.js/);
  for (const id of ['launch', 'shell', 'main', 'roleSwitch', 'bottomNav', 'quickSheet']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('STATIC_CONTRACT prototype consumes the accepted navigation model for role surfaces', () => {
  assert.match(app, /CrewBIQNavigationModel/);
  assert.match(app, /visibleFunctionGroups\(state\.role\)/);
  assert.match(app, /bottomDestinationsForRole\(state\.role\)/);
  assert.doesNotMatch(app, /const\s+ROLE_CONFIG|const\s+FUNCTION_GROUPS/);
});

test('SAFETY_CONTRACT prototype has no production storage writes or production transport', () => {
  const prototypeSource = `${html}\n${css}\n${app}`;
  assert.doesNotMatch(prototypeSource, /localStorage\s*\.\s*setItem|sessionStorage\s*\.\s*setItem/);
  assert.doesNotMatch(prototypeSource, /fiqD_/);
  assert.doesNotMatch(prototypeSource, /fetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('SAFETY_CONTRACT production runtime files retain their pre-prototype hashes', () => {
  const expected = {
    'index.html':'1F083159065B5AF5A4967C0F6CF6E53890DCE0C09CE20193E188AD370C525999',
    'startup-session.js':'DB8B3315D542A4EA0609413B93894936B927CE613DE1F29646C0C0182EBDF281',
    'links.js':'ABC7725A69DBA0C31AADDEA53D8589AB0E66AEE8C3A56CA4E9EC8A0C80D81197',
    'navigation-model.js':'0B5F18B52EF16CA7F5C6287A250B7FFF8C4F1F6D3352E784BC43364062438484',
    'core.js':'2058B2E14698F9F25B2365CBE7FB6C24F8BC9791C4CDC9CF1A1041FAD3D4C8F5',
    'sw.js':'1B5D40F5D0306EAD5F126EC5B9592167B4938488BE108C27CB6E929EEC444866',
  };
  for (const [path, digest] of Object.entries(expected)) assert.equal(hash(path), digest, `${path} changed during isolated prototype work`);
});
