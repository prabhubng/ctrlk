/**
 * CtrlK Phase 3 Test Suite
 * ──────────────────────────────────────────────
 * Tests: ColumnNavigator, FocusNavigator, SessionTracker, ActiveFilterBar
 * Run: node test/phase3.js
 */

// ─── Minimal EventBus ───
class EventBus {
  constructor() { this._l = new Map(); }
  on(e, h) { if (!this._l.has(e)) this._l.set(e, new Set()); this._l.get(e).add(h); return () => this._l.get(e)?.delete(h); }
  emit(e, d) { const l = this._l.get(e); if (l) for (const h of l) { try { h(d, e); } catch (err) { /* */ } } }
  off(e) { if (!e) this._l.clear(); else this._l.delete(e); }
}

// ─── Mock localStorage ───
const mockStorage = {};
globalThis.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; },
  removeItem: (k) => { delete mockStorage[k]; },
};

// ─── Mock DOM ───
globalThis.document = {
  documentElement: { style: { setProperty: () => {} }, getAttribute: () => null, setAttribute: () => {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  body: { contains: () => false },
  head: { appendChild: () => {} },
  createElement: (tag) => ({
    tagName: tag, className: '', innerHTML: '', textContent: '',
    style: { cssText: '' }, setAttribute: () => {}, getAttribute: () => null,
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild: () => {}, prepend: () => {}, remove: () => {},
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener: () => {}, focus: () => {},
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  activeElement: null,
};

import { ColumnNavigator } from '../src/column-nav/column-navigator.js';
import { FocusNavigator } from '../src/focus/focus-navigator.js';
import { SessionTracker } from '../src/session/session-tracker.js';

// ─── Test harness ───
let passed = 0, failed = 0;
function suite(name) { console.log(`\n  ┌─ ${name}`); }
function test(name, fn) {
  try { fn(); passed++; console.log(`  │  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  │  ✗ ${name}`); console.log(`  │    ${err.message}`); }
}
function assert(c, m = 'Assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m) { if (a !== b) throw new Error(m || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ─── Mock Grid Adapter ───
class MockGridAdapter {
  constructor() {
    this._columns = [];
    this._filters = [];
    this._scrollLeft = 0;
    this._ensuredVisible = null;
  }
  getColumns() { return this._columns; }
  getVisibleColumns() { return this._columns.filter(c => c.visible !== false); }
  setColumnVisibility(v) { for (const [id, vis] of Object.entries(v)) { const col = this._columns.find(c => c.colId === id); if (col) col.visible = vis; } }
  ensureColumnVisible(colId) { this._ensuredVisible = colId; }
  getScrollPosition() { return { top: 0, left: this._scrollLeft }; }
  setScrollPosition(pos) { if (pos.left !== undefined) this._scrollLeft = pos.left; }
  getFilters() { return this._filters; }
  setFilters(f) { this._filters = f; }
  clearFilters() { this._filters = []; }
  onGridEvent() { return () => {}; }
  _setColumns(cols) { this._columns = cols.map((c, i) => ({ colId: c.colId || c, headerName: c.headerName || c, visible: c.visible !== false, width: 100, order: i })); }
  _setFilters(f) { this._filters = f; }
}

// ═══════════════════════════════════════════════
// ColumnNavigator Tests
// ═══════════════════════════════════════════════

suite('ColumnNavigator — Search');

test('create instance', () => {
  const cn = new ColumnNavigator(new EventBus());
  assert(cn instanceof ColumnNavigator);
});

test('search finds columns by name', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'name', headerName: 'Issuer Name' },
    { colId: 'moody', headerName: "Moody's Rating" },
    { colId: 'sp', headerName: 'S&P Rating' },
    { colId: 'ticker', headerName: 'Ticker' },
  ]);
  cn.setGridAdapter(adapter);

  const results = cn.search('moody');
  assert(results.length > 0, 'Should find Moody\'s column');
  assertEqual(results[0].column.colId, 'moody');
});

test('search by partial name', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'Insurance Status' },
    { colId: 'b', headerName: 'Insured Amount' },
    { colId: 'c', headerName: 'Name' },
  ]);
  cn.setGridAdapter(adapter);

  const results = cn.search('insur');
  assertEqual(results.length, 2);
});

test('search returns empty array without adapter', () => {
  const cn = new ColumnNavigator(new EventBus());
  assertEqual(cn.search('test').length, 0);
});

test('search boosts bookmarked columns', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'Rating A' },
    { colId: 'b', headerName: 'Rating B' },
  ]);
  cn.setGridAdapter(adapter);
  cn.bookmark('b');

  const results = cn.search('rating');
  assertEqual(results[0].column.colId, 'b', 'Bookmarked column should rank higher');
  assert(results[0].bookmarked);
});

suite('ColumnNavigator — Bookmarks');

test('bookmark and unbookmark', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  cn.bookmark('col-47');
  assert(cn.isBookmarked('col-47'));
  assertEqual(cn.getBookmarkCount(), 1);
  cn.unbookmark('col-47');
  assert(!cn.isBookmarked('col-47'));
});

test('toggleBookmark switches state', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  cn.toggleBookmark('x');
  assert(cn.isBookmarked('x'));
  cn.toggleBookmark('x');
  assert(!cn.isBookmarked('x'));
});

test('setBookmarks replaces all bookmarks', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  cn.bookmark('a');
  cn.bookmark('b');
  cn.setBookmarks(['x', 'y', 'z']);
  assert(!cn.isBookmarked('a'));
  assert(cn.isBookmarked('x'));
  assertEqual(cn.getBookmarkCount(), 3);
});

test('getBookmarks returns in visual order', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A' },
    { colId: 'b', headerName: 'B' },
    { colId: 'c', headerName: 'C' },
  ]);
  cn.setGridAdapter(adapter);
  cn.bookmark('c');
  cn.bookmark('a');
  const bookmarks = cn.getBookmarks();
  assertEqual(bookmarks[0], 'a', 'Should be in visual order, not bookmark order');
  assertEqual(bookmarks[1], 'c');
});

suite('ColumnNavigator — Navigation');

test('jumpTo scrolls to column', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([{ colId: 'target', headerName: 'Target' }]);
  cn.setGridAdapter(adapter);

  cn.jumpTo('target');
  assertEqual(adapter._ensuredVisible, 'target');
  assertEqual(cn.getFocused(), 'target');
});

test('nextBookmark cycles through bookmarks', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A' },
    { colId: 'b', headerName: 'B' },
    { colId: 'c', headerName: 'C' },
  ]);
  cn.setGridAdapter(adapter);
  cn.setBookmarks(['a', 'c']);

  const first = cn.nextBookmark();
  assertEqual(first, 'a');
  const second = cn.nextBookmark();
  assertEqual(second, 'c');
  const wrap = cn.nextBookmark();
  assertEqual(wrap, 'a', 'Should wrap around');
});

test('prevBookmark goes backwards', () => {
  delete mockStorage['ctrlk-col-bookmarks'];
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A' },
    { colId: 'b', headerName: 'B' },
    { colId: 'c', headerName: 'C' },
  ]);
  cn.setGridAdapter(adapter);
  cn.setBookmarks(['a', 'b', 'c']);
  cn._focusedCol = 'b';

  const prev = cn.prevBookmark();
  assertEqual(prev, 'a');
});

test('nextColumn and prevColumn move sequentially', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A' },
    { colId: 'b', headerName: 'B' },
    { colId: 'c', headerName: 'C' },
  ]);
  cn.setGridAdapter(adapter);

  cn.jumpToFirst();
  assertEqual(cn.getFocused(), 'a');
  cn.nextColumn();
  assertEqual(cn.getFocused(), 'b');
  cn.nextColumn();
  assertEqual(cn.getFocused(), 'c');
  cn.prevColumn();
  assertEqual(cn.getFocused(), 'b');
});

suite('ColumnNavigator — Column Groups');

test('define and jump to group', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A' },
    { colId: 'moody', headerName: "Moody's" },
    { colId: 'sp', headerName: 'S&P' },
  ]);
  cn.setGridAdapter(adapter);
  cn.defineGroup('Ratings', ['moody', 'sp']);

  const jumped = cn.jumpToGroup('Ratings');
  assertEqual(jumped, 'moody');
  assertEqual(adapter._ensuredVisible, 'moody');
});

test('getGroups lists all groups', () => {
  const cn = new ColumnNavigator(new EventBus());
  cn.defineGroup('A', ['x', 'y']);
  cn.defineGroup('B', ['z']);
  const groups = cn.getGroups();
  assertEqual(groups.length, 2);
});

suite('ColumnNavigator — Visibility');

test('showOnly hides other columns', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A', visible: true },
    { colId: 'b', headerName: 'B', visible: true },
    { colId: 'c', headerName: 'C', visible: true },
  ]);
  cn.setGridAdapter(adapter);

  cn.showOnly(['b']);
  assert(!adapter._columns[0].visible, 'A should be hidden');
  assert(adapter._columns[1].visible, 'B should be visible');
  assert(!adapter._columns[2].visible, 'C should be hidden');
});

test('showAll makes everything visible', () => {
  const cn = new ColumnNavigator(new EventBus());
  const adapter = new MockGridAdapter();
  adapter._setColumns([
    { colId: 'a', headerName: 'A', visible: false },
    { colId: 'b', headerName: 'B', visible: false },
  ]);
  cn.setGridAdapter(adapter);

  cn.showAll();
  assert(adapter._columns[0].visible);
  assert(adapter._columns[1].visible);
});

// ═══════════════════════════════════════════════
// FocusNavigator Tests
// ═══════════════════════════════════════════════

suite('FocusNavigator — Core');

test('create instance', () => {
  const fn = new FocusNavigator(new EventBus());
  assert(fn instanceof FocusNavigator);
});

test('register and list zones', () => {
  const fn = new FocusNavigator(new EventBus());
  fn.registerZone('sidebar', { element: '#sidebar', order: 1 });
  fn.registerZone('grid', { element: '#grid', order: 2 });
  fn.registerZone('detail', { element: '#detail', order: 3 });

  const zones = fn.getZones();
  assertEqual(zones.length, 3);
  assertEqual(zones[0].id, 'sidebar');
  assertEqual(zones[1].id, 'grid');
  assertEqual(zones[2].id, 'detail');
});

test('register returns unregister function', () => {
  const fn = new FocusNavigator(new EventBus());
  const unreg = fn.registerZone('temp', { element: '#temp', order: 1 });
  assertEqual(fn.getZones().length, 1);
  unreg();
  assertEqual(fn.getZones().length, 0);
});

test('nextZone cycles through zones', () => {
  const fn = new FocusNavigator(new EventBus());
  fn.registerZone('a', { element: '#a', order: 1 });
  fn.registerZone('b', { element: '#b', order: 2 });
  fn.registerZone('c', { element: '#c', order: 3 });

  const first = fn.nextZone();
  assertEqual(first, 'a');
  const second = fn.nextZone();
  assertEqual(second, 'b');
  const third = fn.nextZone();
  assertEqual(third, 'c');
  const wrap = fn.nextZone();
  assertEqual(wrap, 'a', 'Should wrap around');
});

test('prevZone goes backwards', () => {
  const fn = new FocusNavigator(new EventBus());
  fn.registerZone('a', { element: '#a', order: 1 });
  fn.registerZone('b', { element: '#b', order: 2 });
  fn.registerZone('c', { element: '#c', order: 3 });
  fn._activeZone = 'b';

  const prev = fn.prevZone();
  assertEqual(prev, 'a');
});

test('getActiveZone returns current', () => {
  const fn = new FocusNavigator(new EventBus());
  assertEqual(fn.getActiveZone(), null);
  fn.registerZone('a', { element: '#a', order: 1 });
  fn.nextZone();
  assertEqual(fn.getActiveZone(), 'a');
});

test('clear removes all zones', () => {
  const fn = new FocusNavigator(new EventBus());
  fn.registerZone('a', { element: '#a', order: 1 });
  fn.registerZone('b', { element: '#b', order: 2 });
  fn.clear();
  assertEqual(fn.getZones().length, 0);
  assertEqual(fn.getActiveZone(), null);
});

test('onEnter and onLeave callbacks', () => {
  const fn = new FocusNavigator(new EventBus());
  let entered = false, left = false;
  fn.registerZone('a', { element: '#a', order: 1, onEnter: () => { entered = true; } });
  fn.registerZone('b', { element: '#b', order: 2, onLeave: () => { left = true; } });

  fn.nextZone(); // enters a
  assert(entered, 'onEnter should fire');
  fn._activeZone = 'b'; // simulate being in b
  fn.nextZone(); // leaves b, enters a
  assert(left, 'onLeave should fire');
});

// ═══════════════════════════════════════════════
// SessionTracker Tests
// ═══════════════════════════════════════════════

suite('SessionTracker — Core');

test('create and init', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();
  assert(st.getSessionInfo().sessionId !== null);
});

test('markVisited tracks visits', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markVisited('rec-1');
  assert(st.isVisited('rec-1'));
  assertEqual(st.getState('rec-1').visitCount, 1);

  st.markVisited('rec-1'); // second visit
  assertEqual(st.getState('rec-1').visitCount, 2);
});

test('markReviewed marks as reviewed and visited', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markReviewed('rec-1', { notes: 'Looks good' });
  assert(st.isReviewed('rec-1'));
  assert(st.isVisited('rec-1'), 'Should also be marked visited');
  assertEqual(st.getState('rec-1').notes, 'Looks good');
});

test('unmarkReviewed removes reviewed state', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markReviewed('rec-1');
  assert(st.isReviewed('rec-1'));
  st.unmarkReviewed('rec-1');
  assert(!st.isReviewed('rec-1'));
  assert(st.isVisited('rec-1'), 'Should still be visited');
});

test('markDirty tracks edits', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markDirty('rec-1', { fields: ['rating', 'status'] });
  assert(st.isDirty('rec-1'));
  assertEqual(st.getState('rec-1').dirtyFields.length, 2);

  st.markDirty('rec-1', { fields: ['notes'] });
  assertEqual(st.getState('rec-1').dirtyFields.length, 3, 'Fields should accumulate');
});

test('clearDirty removes dirty state', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markDirty('rec-1', { fields: ['x'] });
  st.clearDirty('rec-1');
  assert(!st.isDirty('rec-1'));
  assertEqual(st.getState('rec-1').dirtyFields.length, 0);
});

test('getVisitedIds, getReviewedIds, getDirtyIds', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markVisited('a');
  st.markVisited('b');
  st.markReviewed('b');
  st.markDirty('c');

  assertEqual(st.getVisitedIds().length, 2);
  assertEqual(st.getReviewedIds().length, 1);
  assertEqual(st.getDirtyIds().length, 1);
});

test('getByState filters records', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markVisited('a');
  st.markReviewed('b');
  st.markVisited('c');

  const unreviewed = st.getByState('unreviewed');
  assertEqual(unreviewed.length, 2, 'a and c are visited but not reviewed');
  const reviewed = st.getByState('reviewed');
  assertEqual(reviewed.length, 1);
  assertEqual(reviewed[0].id, 'b');
});

suite('SessionTracker — Batch & Progress');

test('setBatch and getProgress', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.setBatch(['r1', 'r2', 'r3', 'r4', 'r5'], 'Q4 Review');
  st.markVisited('r1');
  st.markReviewed('r1');
  st.markVisited('r2');
  st.markDirty('r2');

  const progress = st.getProgress();
  assertEqual(progress.total, 5);
  assertEqual(progress.visited, 2);
  assertEqual(progress.reviewed, 1);
  assertEqual(progress.dirty, 1);
  assertEqual(progress.percent, 20);
  assertEqual(progress.name, 'Q4 Review');
});

test('getNextUnreviewed finds first unreviewed in batch', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.setBatch(['r1', 'r2', 'r3']);
  st.markReviewed('r1');

  const next = st.getNextUnreviewed();
  assertEqual(next, 'r2');
});

test('getNextUnvisited finds first unvisited in batch', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.setBatch(['r1', 'r2', 'r3']);
  st.markVisited('r1');
  st.markVisited('r2');

  const next = st.getNextUnvisited();
  assertEqual(next, 'r3');
});

test('getNextUnreviewed returns null when all reviewed', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.setBatch(['r1', 'r2']);
  st.markReviewed('r1');
  st.markReviewed('r2');

  assertEqual(st.getNextUnreviewed(), null);
});

suite('SessionTracker — Session Management');

test('reset clears all tracking', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.markVisited('a');
  st.markReviewed('b');
  st.reset();

  assert(!st.isVisited('a'));
  assert(!st.isReviewed('b'));
});

test('export produces JSON summary', () => {
  delete mockStorage['ctrlk-session'];
  const st = new SessionTracker(new EventBus());
  st.init();

  st.setBatch(['a', 'b', 'c']);
  st.markReviewed('a');
  st.markDirty('b', { fields: ['x'] });

  const json = st.export();
  const parsed = JSON.parse(json);
  assert(parsed.sessionId);
  assert(parsed.progress);
  assertEqual(parsed.progress.reviewed, 1);
  assertEqual(parsed.progress.dirty, 1);
});

test('session persists and reloads', () => {
  delete mockStorage['ctrlk-session'];
  const bus = new EventBus();

  const st1 = new SessionTracker(bus);
  st1.init();
  const sessionId = st1.getSessionInfo().sessionId;
  st1.markVisited('rec-1');
  st1.markReviewed('rec-2');

  // Simulate page reload — new instance loading from storage
  const st2 = new SessionTracker(new EventBus());
  st2.init(); // Should resume the same session

  assert(st2.isVisited('rec-1'), 'Should persist visited state');
  assert(st2.isReviewed('rec-2'), 'Should persist reviewed state');
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════

console.log('\n  └─ Done');
console.log(`\n  ─────────────────────────────`);
console.log(`  ⚡ CtrlK Phase 3 Test Results`);
console.log(`  ─────────────────────────────`);
console.log(`  ✓ Passed: ${passed}`);
if (failed > 0) {
  console.log(`  ✗ Failed: ${failed}`);
}
console.log(`  Total:   ${passed + failed}`);
console.log(`  ─────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
