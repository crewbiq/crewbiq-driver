import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('prototype/crewbiq-next/index.html');
const css = read('prototype/crewbiq-next/styles.css');
const app = read('prototype/crewbiq-next/app.js');
const standalone = read('prototype/crewbiq-next/crewbiq-next-standalone.html');
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

test('STATIC_CONTRACT standalone review build embeds CSS, JavaScript, and read-only model snapshot', () => {
  assert.match(standalone, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
  assert.match(standalone, /<style>[\s\S]*:root\{/);
  assert.match(standalone, /PROTOTYPE EMBEDDED NAVIGATION MODEL SNAPSHOT/);
  assert.match(standalone, /deepFreeze\(window\.CrewBIQNavigationModel\)/);
  assert.match(standalone, /\(function \(\) \{[\s\S]*CrewBIQNavigationModel/);
  assert.doesNotMatch(standalone, /(?:src|href)="(?:styles\.css|app\.js|\.\.\/\.\.\/navigation-model\.js)"/);
  assert.doesNotMatch(standalone, /https?:\/\//);
});

test('STATIC_CONTRACT standalone inline scripts parse and responsive switching remains packaged', () => {
  const scripts = [...standalone.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 2);
  scripts.forEach((script, index) => new vm.Script(script, { filename: `standalone-inline-${index}.js` }));
  assert.match(standalone, /@media\(max-width:720px\)/);
  assert.match(standalone, /\.rail\{display:none\}/);
  assert.match(standalone, /\.bottom-nav\{position:fixed/);
  assert.match(standalone, /@media\(max-width:390px\)/);
  assert.match(standalone, /safe-area-inset-top/);
  assert.match(standalone, /safe-area-inset-bottom/);
});

test('STATIC_CONTRACT prototype consumes the accepted navigation model for role surfaces', () => {
  assert.match(app, /CrewBIQNavigationModel/);
  assert.match(app, /visibleFunctionGroups\(state\.role\)/);
  assert.match(app, /bottomDestinationsForRole\(state\.role\)/);
  assert.doesNotMatch(app, /const\s+ROLE_CONFIG|const\s+FUNCTION_GROUPS/);
});

test('STATIC_CONTRACT mobile polish preserves role evaluation and adds operational density', () => {
  assert.match(html, /id="roleToggle"/);
  assert.match(html, /id="roleSwitch"/);
  assert.match(css, /\.role-control\.open \.role-switch/);
  assert.match(app, /function operationalSummary\(page\)/);
  for (const signal of ['Active load', 'PTI', 'RPM', 'Trucks moving']) assert.match(app, new RegExp(signal));
  assert.match(css, /@media\(max-width:720px\)\{body\{font-size:16px\}/);
  assert.match(css, /\.bottom-item\{font-size:12px\}/);
  assert.match(css, /\.metric-label\{font-size:13px\}/);
  assert.match(css, /\.tool-card p,[^}]*font-size:14px/);
});

test('SAFETY_CONTRACT prototype has no production storage writes or production transport', () => {
  const prototypeSource = `${html}\n${css}\n${app}\n${standalone}`;
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
