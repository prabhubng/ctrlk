/**
 * CtrlK ViewShare Test Suite
 * Run: node test/share.js
 */

// ─── Minimal EventBus ───
class EventBus {
  constructor() { this._l = new Map(); }
  on(e, h) { if (!this._l.has(e)) this._l.set(e, new Set()); this._l.get(e).add(h); return () => this._l.get(e)?.delete(h); }
  emit(e, d) { const l = this._l.get(e); if (l) for (const h of l) { try { h(d, e); } catch (err) { /* */ } } }
  off(e) { if (!e) this._l.clear(); else this._l.delete(e); }
}

// ─── Mocks ───
const mockStorage = {};
globalThis.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; },
  removeItem: (k) => { delete mockStorage[k]; },
};
globalThis.window = { location: { hash: '', href: 'https://app.example.com/dashboard', pathname: '/dashboard', search: '' }, history: { replaceState: () => {} } };
globalThis.document = { documentElement: { style: { setProperty: () => {} }, getAttribute: () => null, setAttribute: () => {} }, querySelectorAll: () => [], body: {} };
globalThis.TextEncoder = class { encode(s) { const b = []; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 128) b.push(c); else if (c < 2048) { b.push(192|(c>>6), 128|(c&63)); } else { b.push(224|(c>>12), 128|((c>>6)&63), 128|(c&63)); } } return new Uint8Array(b); } };
globalThis.TextDecoder = class { decode(b) { let s = ''; for (let i = 0; i < b.length; i++) { if (b[i] < 128) s += String.fromCharCode(b[i]); else if (b[i] < 224) { s += String.fromCharCode(((b[i]&31)<<6)|(b[i+1]&63)); i++; } else { s += String.fromCharCode(((b[i]&15)<<12)|((b[i+1]&63)<<6)|(b[i+2]&63)); i+=2; } } return s; } };
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
try { globalThis.navigator = { clipboard: null }; } catch(e) { /* navigator is read-only in some environments */ }

// ─── Minimal ViewStateManager mock ───
class MockViewStateManager {
  constructor() { this._gridAdapter = null; this._providers = new Map(); }
  setGridAdapter(a) { this._gridAdapter = a; }
  registerProvider(key, p) { this._providers.set(key, p); return () => this._providers.delete(key); }
  capture() { return { grid: this._gridAdapter ? { columns: [], filters: [{ colId: 'status', type: 'text', value: 'active' }], sort: [] } : null, app: {}, timestamp: Date.now() }; }
  autoSave() {}
}

import { ViewShare } from '../src/share/view-share.js';

// ─── Test harness ───
let passed = 0, failed = 0;
function suite(name) { console.log(`\n  ┌─ ${name}`); }
function test(name, fn) { try { fn(); passed++; console.log(`  │  ✓ ${name}`); } catch (err) { failed++; console.log(`  │  ✗ ${name}`); console.log(`  │    ${err.message}`); } }
async function testAsync(name, fn) { try { await fn(); passed++; console.log(`  │  ✓ ${name}`); } catch (err) { failed++; console.log(`  │  ✗ ${name}`); console.log(`  │    ${err.message}`); } }
function assert(c, m = 'Assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m) { if (a !== b) throw new Error(m || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ═══════════════════════════════════════════════
// Tier 1 — URL Sharing Tests
// ═══════════════════════════════════════════════

suite('ViewShare — Tier 1 (URL Links)');

test('create instance', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  assert(share instanceof ViewShare);
});

test('createLink produces a URL with ctrlk hash', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setUser('Alice');

  const link = share.createLink({ name: 'Test View' });
  assert(link.includes('#ctrlk='), 'Link should contain ctrlk hash prefix');
  assert(link.startsWith('https://app.example.com/dashboard'), 'Should use current page URL');
});

test('createLink encodes view state', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  views.setGridAdapter({ captureState: () => ({ columns: [{ colId: 'name' }], filters: [{ colId: 'x', value: 'test' }] }) });
  const share = new ViewShare(bus, views);

  const link = share.createLink({ name: 'With Grid State' });
  assert(link.length > 50, 'Link should contain encoded state');
});

test('peekLink extracts metadata without applying', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setUser('Bob');

  const link = share.createLink({ name: 'Peek Test', description: 'A test view' });
  const meta = share.peekLink(link);

  assert(meta !== null, 'Should extract metadata');
  assertEqual(meta.name, 'Peek Test');
  assertEqual(meta.description, 'A test view');
  assertEqual(meta.sharedBy, 'Bob');
  assert(meta.sharedAt > 0);
});

test('peekLink returns null for non-ctrlk URLs', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);

  assertEqual(share.peekLink('https://example.com/page'), null);
  assertEqual(share.peekLink('https://example.com/page#other=data'), null);
});

test('createLink and decompress round-trip', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  views.setGridAdapter({ captureState: () => ({ columns: [], filters: [{ colId: 'sector', value: 'Healthcare' }], sort: [{ colId: 'name', sort: 'asc' }] }) });
  const share = new ViewShare(bus, views);
  share.setUser('Analyst');

  const link = share.createLink({ name: 'Round Trip', description: 'Testing compression' });

  // Extract and decompress
  const hash = link.split('#')[1];
  const encoded = hash.slice('ctrlk='.length);
  const decoded = share._decompress(encoded);
  const payload = JSON.parse(decoded);

  assertEqual(payload.n, 'Round Trip');
  assertEqual(payload.d, 'Testing compression');
  assertEqual(payload.by, 'Analyst');
  assert(payload.s !== null, 'State should be present');
  assert(payload.s.grid !== null, 'Grid state should be present');
});

test('createLink emits share:link-created event', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  let eventData = null;
  bus.on('share:link-created', (d) => { eventData = d; });

  share.createLink({ name: 'Event Test' });
  assert(eventData !== null, 'Should emit event');
  assertEqual(eventData.name, 'Event Test');
  assert(eventData.length > 0);
  assert(eventData.compressedSize > 0);
});

test('handles Unicode in view names and values', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setUser('田中太郎');

  const link = share.createLink({ name: 'Übersicht — Données françaises', description: '测试中文' });
  const meta = share.peekLink(link);

  assertEqual(meta.name, 'Übersicht — Données françaises');
  assertEqual(meta.description, '测试中文');
  assertEqual(meta.sharedBy, '田中太郎');
});

// ═══════════════════════════════════════════════
// Tier 2 — Stored Sharing Tests
// ═══════════════════════════════════════════════

suite('ViewShare — Tier 2 (Stored Sharing)');

test('setProvider validates interface', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);

  let threw = false;
  try { share.setProvider({ save: () => {} }); } catch (e) { threw = true; }
  assert(threw, 'Should reject incomplete provider');
});

test('hasProvider returns correct state', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);

  assert(!share.hasProvider());
  share.setProvider({ save: async()=>'id', load: async()=>null, list: async()=>[], delete: async()=>true });
  assert(share.hasProvider());
});

test('createLocalProvider works for save/load/list/delete', async () => {
  // Clear storage
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('ctrlk-shared')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('test-share'));
  share.setUser('TestUser');

  // Publish
  const viewId = await share.publish('Shared View 1', { description: 'Test share' });
  assert(viewId, 'Should return a view ID');

  // List
  let list = await share.list();
  assertEqual(list.length, 1);
  assertEqual(list[0].name, 'Shared View 1');
  assertEqual(list[0].sharedBy, 'TestUser');

  // Load
  const loaded = await share.load(viewId);
  assert(loaded, 'Should load successfully');

  // Publish another
  await share.publish('Shared View 2');
  list = await share.list();
  assertEqual(list.length, 2);

  // Delete
  const deleted = await share.remove(viewId);
  assert(deleted);
  list = await share.list();
  assertEqual(list.length, 1);
  assertEqual(list[0].name, 'Shared View 2');
});

await testAsync('publish emits share:published event', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('evt-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('evt-share'));
  share.setUser('EventTester');

  let eventData = null;
  bus.on('share:published', (d) => { eventData = d; });

  await share.publish('Published View', { scope: 'org' });
  assert(eventData !== null);
  assertEqual(eventData.name, 'Published View');
  assertEqual(eventData.scope, 'org');
  assertEqual(eventData.sharedBy, 'EventTester');
});

await testAsync('load emits share:loaded event', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('load-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('load-share'));
  share.setUser('Loader');

  const viewId = await share.publish('Load Event Test');

  let eventData = null;
  bus.on('share:loaded', (d) => { eventData = d; });

  await share.load(viewId);
  assert(eventData !== null);
  assertEqual(eventData.name, 'Load Event Test');
  assertEqual(eventData.sharedBy, 'Loader');
  assertEqual(eventData.useCount, 1);
});

await testAsync('load increments useCount', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('count-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('count-share'));
  share.setUser('Counter');

  const viewId = await share.publish('Count Test');
  await share.load(viewId);
  await share.load(viewId);
  await share.load(viewId);

  const list = await share.list();
  const view = list.find(v => v.id === viewId);
  assertEqual(view.useCount, 3);
});

await testAsync('expired views are not loaded', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('exp-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('exp-share'));

  // Publish with immediate expiration
  const viewId = await share.publish('Expired View', { expiresIn: -1000 });

  const loaded = await share.load(viewId);
  assert(!loaded, 'Expired view should not load');
});

await testAsync('expired views filtered from list', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('explist-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('explist-share'));

  await share.publish('Active View');
  await share.publish('Expired View', { expiresIn: -1000 });

  const list = await share.list();
  assertEqual(list.length, 1, 'Expired view should be filtered from list');
  assertEqual(list[0].name, 'Active View');
});

await testAsync('publish without provider throws', async () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);

  let threw = false;
  try { await share.publish('No Provider'); } catch (e) { threw = true; }
  assert(threw, 'Should throw without provider');
});

await testAsync('load returns false for non-existent view', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('miss-share')) delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('miss-share'));

  const loaded = await share.load('nonexistent-id');
  assert(!loaded);
});

suite('ViewShare — Recent Shares');

await testAsync('getRecent tracks published and loaded views', async () => {
  Object.keys(mockStorage).forEach(k => { if (k.startsWith('recent') || k === 'ctrlk-recent-shares') delete mockStorage[k]; });

  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setProvider(share.createLocalProvider('recent-share'));
  share.setUser('Tracker');

  const id1 = await share.publish('View A');
  const id2 = await share.publish('View B');
  await share.load(id1);

  const recent = share.getRecent();
  assert(recent.length >= 2, 'Should have at least 2 recent entries');
  // Most recent first
  assertEqual(recent[0].type, 'loaded');
});

suite('ViewShare — Live Sharing (Tier 3 API)');

test('startBroadcast and stopBroadcast emit events', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setUser('Broadcaster');

  let startEvent = null, stopEvent = null;
  bus.on('share:broadcast-start', (d) => { startEvent = d; });
  bus.on('share:broadcast-stop', (d) => { stopEvent = d; });

  share.startBroadcast({ channel: 'team-alpha' });
  assert(share.isBroadcasting());
  assertEqual(startEvent.userId, 'Broadcaster');
  assertEqual(startEvent.channel, 'team-alpha');

  share.stopBroadcast();
  assert(!share.isBroadcasting());
  assertEqual(stopEvent.userId, 'Broadcaster');
});

test('follow and stopFollow emit events', () => {
  const bus = new EventBus();
  const views = new MockViewStateManager();
  const share = new ViewShare(bus, views);
  share.setUser('Follower');

  let followEvent = null, stopEvent = null;
  bus.on('share:follow-start', (d) => { followEvent = d; });
  bus.on('share:follow-stop', (d) => { stopEvent = d; });

  share.follow('Leader');
  assert(share.isFollowing());
  assertEqual(followEvent.followUserId, 'Leader');

  share.stopFollow();
  assert(!share.isFollowing());
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════

console.log('\n  └─ Done');
console.log(`\n  ─────────────────────────────`);
console.log(`  ⚡ CtrlK ViewShare Test Results`);
console.log(`  ─────────────────────────────`);
console.log(`  ✓ Passed: ${passed}`);
if (failed > 0) console.log(`  ✗ Failed: ${failed}`);
console.log(`  Total:   ${passed + failed}`);
console.log(`  ─────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
