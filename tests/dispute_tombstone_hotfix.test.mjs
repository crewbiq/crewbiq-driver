import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dispute-tombstone-hotfix.js', import.meta.url), 'utf8');

function makeContext(syncResult) {
  let disputes = [
    { id: 'd_keep', loadId: 'LOAD-1', status: 'pending' },
    { id: 'd_delete', loadId: 'LOAD-2', status: 'won', synced: true },
  ];
  const rendered = [];
  const toasts = [];
  const events = [];
  let syncSnapshot = null;

  const api = {
    getDriverDisputed() { return disputes; },
    setDriverDisputed(value) { disputes = value; },
    renderDriverDisputedPage() {
      rendered.push(disputes.map(item => ({ ...item })));
    },
  };

  const window = {
    CrewBIQLoads: api,
    CrewBIQCore: {
      toast(message, type = '') { toasts.push({ message, type }); },
      events: { emit(name, payload) { events.push({ name, payload }); } },
    },
    confirm() { return true; },
    async doSync(options) {
      syncSnapshot = disputes.map(item => ({ ...item }));
      assert.equal(options && options.forceAll, true);
      return syncResult;
    },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
  };
  window.window = window;

  vm.runInNewContext(source, { window, setTimeout, clearTimeout, Promise, Date });
  return {
    window,
    api,
    get disputes() { return disputes; },
    rendered,
    toasts,
    events,
    get syncSnapshot() { return syncSnapshot; },
  };
}

test('confirmed dispute deletion syncs an explicit hidden tombstone', async () => {
  const ctx = makeContext({ ok: true });

  const result = await ctx.window.driverDeleteDispute('d_delete');

  assert.equal(result, true);
  const tombstone = ctx.disputes.find(item => item.id === 'd_delete');
  assert.equal(tombstone.status, 'deleted');
  assert.equal(tombstone.synced, false);
  assert.match(tombstone.deletedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(ctx.syncSnapshot.find(item => item.id === 'd_delete').status, 'deleted');
  assert.equal(ctx.rendered.at(-1).map(item => item.id).join(','), 'd_keep');
  assert.ok(ctx.toasts.some(item => item.message === 'Dispute deleted and synced'));
  const event = ctx.events.at(-1);
  assert.equal(event.name, 'dispute:deleted');
  assert.equal(event.payload.id, 'd_delete');
  assert.equal(event.payload.durable, true);
});

test('failed sync retains a hidden tombstone for later retry', async () => {
  const ctx = makeContext({ ok: false, error: 'offline' });

  const result = await ctx.window.driverDeleteDispute('d_delete');

  assert.equal(result, false);
  assert.equal(ctx.disputes.find(item => item.id === 'd_delete').status, 'deleted');
  assert.equal(ctx.rendered.at(-1).map(item => item.id).join(','), 'd_keep');
  assert.ok(ctx.toasts.some(item => item.type === 'warn' && /pending sync/i.test(item.message)));
  assert.equal(ctx.events.length, 0);
});
