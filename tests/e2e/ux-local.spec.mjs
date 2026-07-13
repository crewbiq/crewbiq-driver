import { test, expect } from './fixtures/observability.mjs';

const IDENTIFIER_CANARY = 'E2E-UX-IDENTIFIER-CANARY';
const PASSWORD_CANARY = 'E2E-UX-PASSWORD-CANARY';
const VIEWPORTS = [
  { name: 'compact-mobile', width: 360, height: 800 },
  { name: 'standard-mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

async function openSetup(page) {
  await page.goto('/');
  const started = Date.now();
  await page.evaluate(() => {
    if (typeof window.hideSplash !== 'function') throw new Error('hideSplash is unavailable');
    window.hideSplash();
  });
  await expect(page.locator('#splashScreen')).toBeHidden();
  await expect(page.locator('#setupScreen')).toBeVisible();
  return Date.now() - started;
}

function assertLocalOnly(urls) {
  for (const value of urls) {
    const url = new URL(value);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname.startsWith('/v1/')).toBe(false);
  }
}

async function attachObservations(testInfo, scenarioId, payload) {
  await testInfo.attach(`${scenarioId}-observations`, {
    body: Buffer.from(`${JSON.stringify({
      schema_version: '1.0.0',
      scenario_id: scenarioId,
      entered_values_omitted: true,
      ...payload,
    }, null, 2)}\n`),
    contentType: 'application/json',
  });
}

test('UX-01 setup and login keyboard interaction cost', async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: 'expected_result',
    description: 'Role, auth tab, identifier, password and Login controls are keyboard-reachable without submitting credentials.',
  });
  const requestUrls = [];
  page.on('request', request => requestUrls.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  const splashDurationMs = await openSetup(page);

  await page.evaluate(() => document.activeElement?.blur());
  const expected = new Set([
    '#setupRoleDriver',
    '#setupRoleOwnerOp',
    '#setupRoleFleet',
    '#authLoginTab',
    '#authSignupTab',
    '#authLoginId',
    '#authLoginPassword',
    '#authLoginPanel > .btn.primary',
  ]);
  const reached = new Set();
  const keyboardOrder = [];
  const started = Date.now();

  for (let step = 0; step < 20 && reached.size < expected.size; step += 1) {
    await page.keyboard.press('Tab');
    const descriptor = await page.evaluate(() => {
      const element = document.activeElement;
      const selector = element?.id
        ? `#${element.id}`
        : (element?.matches('#authLoginPanel > .btn.primary')
          ? '#authLoginPanel > .btn.primary'
          : element?.tagName.toLowerCase());
      return {
        selector,
        tag: element?.tagName.toLowerCase() || '',
        type: element?.getAttribute('type') || '',
      };
    });
    keyboardOrder.push(descriptor);
    if (expected.has(descriptor.selector)) reached.add(descriptor.selector);
    if (descriptor.selector === '#authLoginId') await page.keyboard.type(IDENTIFIER_CANARY);
    if (descriptor.selector === '#authLoginPassword') await page.keyboard.type(PASSWORD_CANARY);
  }

  const unreachableControls = [...expected].filter(selector => !reached.has(selector));
  expect(unreachableControls).toEqual([]);
  await expect(page.locator('#authLoginPassword')).toHaveAttribute('type', 'password');
  assertLocalOnly(requestUrls);

  await attachObservations(testInfo, 'UX-01', {
    viewport: { width: 390, height: 844 },
    hard_assertions: {
      required_controls_keyboard_reachable: true,
      login_not_submitted: true,
      network_local_only: true,
      entered_values_absent_from_evidence: true,
    },
    measurements: {
      interaction_steps: keyboardOrder.length,
      elapsed_ms: Date.now() - started,
      splash_duration_ms: splashDurationMs,
      keyboard_order: keyboardOrder,
      unreachable_controls: unreachableControls,
    },
    observations: [{
      code: 'LOGIN_IDENTIFIER_COPY_REVIEW',
      summary: 'The setup label says Email or Nickname while the authenticated Orchestrator login contract accepts an email field.',
      review_required: true,
    }],
  });
});

test('A11Y-01 visible setup control inventory', async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: 'expected_result',
    description: 'Password semantics remain secure and setup control naming gaps are recorded as human-review observations.',
  });
  const requestUrls = [];
  page.on('request', request => requestUrls.push(request.url()));
  await openSetup(page);

  const inventory = await page.locator('#setupScreen').evaluate(setup => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const sourceFor = element => {
      if (element.getAttribute('aria-label')) return 'aria-label';
      if (element.getAttribute('aria-labelledby')) return 'aria-labelledby';
      if (element.labels?.length) return 'associated-label';
      if (element.getAttribute('title')) return 'title';
      if ((element.textContent || '').trim()) return 'text';
      if (element.getAttribute('placeholder')) return 'placeholder';
      return 'none';
    };
    const controls = [...setup.querySelectorAll('button,input,select,textarea,a[href]')]
      .filter(visible)
      .map(element => ({
        id: element.id || null,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || null,
        name_source: sourceFor(element),
        text: (element.textContent || '').trim(),
      }));
    const emojiOnly = controls.filter(control => {
      if (!control.text || !/\p{Extended_Pictographic}/u.test(control.text)) return false;
      return control.text.replace(/\p{Extended_Pictographic}|\uFE0F|\s/gu, '') === '';
    });
    return {
      controls,
      emoji_only_control_ids: emojiOnly.map(control => control.id || `${control.tag}:unnamed`),
      placeholder_only_control_ids: controls
        .filter(control => control.name_source === 'placeholder')
        .map(control => control.id || `${control.tag}:unnamed`),
      name_source_counts: controls.reduce((counts, control) => {
        counts[control.name_source] = (counts[control.name_source] || 0) + 1;
        return counts;
      }, {}),
    };
  });
  const passwordContracts = await page.locator('#setupScreen input[type="password"]').evaluateAll(inputs => (
    inputs.map(input => ({ id: input.id, type: input.type, autocomplete: input.autocomplete }))
  ));
  expect(passwordContracts).toEqual([
    { id: 'authLoginPassword', type: 'password', autocomplete: 'current-password' },
    { id: 'authSignupPassword', type: 'password', autocomplete: 'new-password' },
  ]);
  const statusRegion = await page.locator('#loginStatus').evaluate(element => ({
    exists: true,
    role: element.getAttribute('role'),
    aria_live: element.getAttribute('aria-live'),
  }));
  assertLocalOnly(requestUrls);

  const observations = [];
  if (inventory.placeholder_only_control_ids.length) observations.push({
    code: 'PLACEHOLDER_ONLY_NAMES',
    summary: `${inventory.placeholder_only_control_ids.length} visible input controls rely on placeholder text for their measured name source.`,
    review_required: true,
  });
  if (inventory.emoji_only_control_ids.length) observations.push({
    code: 'EMOJI_ONLY_NAMES',
    summary: `${inventory.emoji_only_control_ids.length} visible controls have emoji-only measured text names.`,
    review_required: true,
  });
  if (!statusRegion.role && !statusRegion.aria_live) observations.push({
    code: 'STATUS_LIVE_REGION_REVIEW',
    summary: 'The login status element exists but has no measured role or aria-live semantics.',
    review_required: true,
  });

  await attachObservations(testInfo, 'A11Y-01', {
    viewport: { width: 1280, height: 720 },
    hard_assertions: {
      secure_input_type_retained: true,
      secure_input_autocomplete_retained: true,
      status_region_exists: statusRegion.exists,
      network_local_only: true,
    },
    measurements: {
      visible_control_count: inventory.controls.length,
      name_source_counts: inventory.name_source_counts,
      emoji_only_control_ids: inventory.emoji_only_control_ids,
      placeholder_only_control_ids: inventory.placeholder_only_control_ids,
      secure_input_contracts: passwordContracts,
      status_region: statusRegion,
    },
    observations,
  });
});

test('RESPONSIVE-01 setup remains bounded at required viewports', async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: 'expected_result',
    description: 'The setup shell has no horizontal overflow and every visible control can be brought fully into each required viewport.',
  });
  const requestUrls = [];
  page.on('request', request => requestUrls.push(request.url()));
  const measurements = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const splashDurationMs = await openSetup(page);
    const controls = page.locator('#setupScreen button:visible, #setupScreen input:visible, #setupScreen select:visible');
    const controlCount = await controls.count();
    let minWidth = Number.POSITIVE_INFINITY;
    let minHeight = Number.POSITIVE_INFINITY;
    const outOfBounds = [];
    for (let index = 0; index < controlCount; index += 1) {
      const control = controls.nth(index);
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      if (!box) continue;
      minWidth = Math.min(minWidth, box.width);
      minHeight = Math.min(minHeight, box.height);
      if (
        box.x < -1
        || box.x + box.width > viewport.width + 1
        || box.y < -1
        || box.y + box.height > viewport.height + 1
      ) {
        outOfBounds.push(await control.getAttribute('id') || `control-${index}`);
      }
    }
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const card = document.querySelector('.setup-card').getBoundingClientRect();
      const splash = document.getElementById('splashScreen');
      return {
        document_client_width: root.clientWidth,
        document_scroll_width: root.scrollWidth,
        setup_card_left: card.left,
        setup_card_right: card.right,
        splash_display: getComputedStyle(splash).display,
        splash_pointer_events: getComputedStyle(splash).pointerEvents,
      };
    });
    expect(layout.document_scroll_width).toBeLessThanOrEqual(layout.document_client_width + 1);
    expect(layout.setup_card_left).toBeGreaterThanOrEqual(-1);
    expect(layout.setup_card_right).toBeLessThanOrEqual(viewport.width + 1);
    expect(outOfBounds).toEqual([]);
    expect(layout.splash_display === 'none' || layout.splash_pointer_events === 'none').toBe(true);
    measurements.push({
      viewport,
      control_count: controlCount,
      minimum_target_width: Number.isFinite(minWidth) ? Math.round(minWidth * 10) / 10 : 0,
      minimum_target_height: Number.isFinite(minHeight) ? Math.round(minHeight * 10) / 10 : 0,
      out_of_bounds_controls: outOfBounds,
      splash_duration_ms: splashDurationMs,
      layout,
    });
  }
  assertLocalOnly(requestUrls);

  const smallTargets = measurements.filter(item => (
    item.minimum_target_width < 44 || item.minimum_target_height < 44
  ));
  await attachObservations(testInfo, 'RESPONSIVE-01', {
    viewport: null,
    viewports: VIEWPORTS,
    hard_assertions: {
      no_document_horizontal_overflow: true,
      setup_card_within_viewport: true,
      controls_reachable_within_viewport: true,
      splash_not_trapping_page: true,
      network_local_only: true,
    },
    measurements: {
      viewport_results: measurements,
    },
    observations: smallTargets.length ? [{
      code: 'TARGET_SIZE_REVIEW',
      summary: `${smallTargets.length} viewport measurements include a minimum control target below 44 CSS pixels.`,
      review_required: true,
    }] : [],
  });
});
