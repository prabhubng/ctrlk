/**
 * CtrlK Phase 1 Test Suite
 * ──────────────────────────────────────────────
 * Tests: ViewStateManager, SelectionModel, FieldRegistry
 * Run: node test/phase1.js
 */

// ─── Minimal EventBus for testing (no DOM dependency) ───
class EventBus {
  constructor() { this._l = new Map(); }
  on(e, h) { if (!this._l.has(e)) this._l.set(e, new Set()); this._l.get(e).add(h); return () => this._l.get(e)?.delete(h); }
  emit(e, d) { const l = this._l.get(e); if (l) for (const h of l) { try { h(d, e); } catch (err) { /* silent in tests */ } } }
  off(e) { if (!e) this._l.clear(); else this._l.delete(e); }
}

// ─── Minimal mock localStorage ───
const mockStorage = {};
const localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; },
  removeItem: (k) => { delete mockStorage[k]; },
};
globalThis.localStorage = localStorage;

// ─── Mock document for field tests ───
globalThis.document = {
  documentElement: {
    style: { setProperty: () => {} },
    getAttribute: () => null,
    setAttribute: () => {},
  },
  querySelectorAll: () => [],
  body: {},
};

// ─── Import modules ───
import { ViewStateManager } from '../src/views/view-state-manager.js';
import { SelectionModel } from '../src/selection/selection-model.js';
import { FieldRegistry } from '../src/fields/field-registry.js';

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
    this._state = { columns: [], filters: [], sort: [], scrollTop: 0, scrollLeft: 0, selectedRowIds: [] };
    this._rows = [];
    this._selected = [];
  }
  captureState() { return JSON.parse(JSON.stringify(this._state)); }
  restoreState(state) { this._state = JSON.parse(JSON.stringify(state)); }
  getRows() { return this._rows; }
  getRowCount() { return this._rows.length; }
  getRowIdField() { return 'id'; }
  getSelectedRowIds() { return [...this._selected]; }
  setSelectedRowIds(ids) { this._selected = [...ids]; }
  getColumns() { return this._state.columns; }
  getFilters() { return this._state.filters; }
  setFilters(f) { this._state.filters = f; }
  clearSelection() { this._selected = []; }
  // Helpers for testing
  _setRows(rows) { this._rows = rows; }
  _setColumns(cols) { this._state.columns = cols; }
  _setFilters(filters) { this._state.filters = filters; }
}

// ═══════════════════════════════════════════════
// ViewStateManager Tests
// ═══════════════════════════════════════════════

suite('ViewStateManager — Core');

test('create instance', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  assert(vm instanceof ViewStateManager);
});

test('capture returns state object', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  const adapter = new MockGridAdapter();
  adapter._setColumns([{ colId: 'name', headerName: 'Name', visible: true }]);
  adapter._setFilters([{ colId: 'name', type: 'text', value: 'test' }]);
  vm.setGridAdapter(adapter);
  const state = vm.capture();
  assert(state.grid !== null, 'Grid state should be captured');
  assert(state.timestamp > 0, 'Should have timestamp');
});

test('save creates a named view', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());
  const view = vm.save('Test View');
  assertEqual(view.name, 'Test View');
  assert(vm.has('Test View'));
  assertEqual(vm.count(), 1);
});

test('load restores a saved view', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  const adapter = new MockGridAdapter();
  adapter._setFilters([{ colId: 'x', type: 'text', value: 'hello' }]);
  vm.setGridAdapter(adapter);

  vm.save('View A');
  adapter._setFilters([]); // clear filters

  const loaded = vm.load('View A');
  assert(loaded, 'Should load successfully');
  assertEqual(adapter._state.filters.length, 1, 'Filters should be restored');
  assertEqual(adapter._state.filters[0].value, 'hello');
});

test('load returns false for non-existent view', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  assert(!vm.load('non-existent'));
});

test('list returns all saved views', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());
  vm.save('View B');
  vm.save('View A');
  const list = vm.list();
  assertEqual(list.length, 2);
  assert(list.some(v => v.name === 'View A'), 'Should contain View A');
  assert(list.some(v => v.name === 'View B'), 'Should contain View B');
});

test('delete removes a view', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());
  vm.save('Temp');
  assert(vm.has('Temp'));
  vm.delete('Temp');
  assert(!vm.has('Temp'));
});

test('rename changes view name', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());
  vm.save('Old Name');
  vm.rename('Old Name', 'New Name');
  assert(!vm.has('Old Name'));
  assert(vm.has('New Name'));
});

test('export produces valid JSON', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());
  vm.save('Export Test');
  const json = vm.export('Export Test');
  const parsed = JSON.parse(json);
  assertEqual(parsed.name, 'Export Test');
});

test('import restores a view from JSON', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  const json = JSON.stringify({ name: 'Imported', grid: { columns: [], filters: [], sort: [] }, app: {} });
  vm.import(json);
  assert(vm.has('Imported'));
});

test('registerProvider captures and restores custom state', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  vm.setGridAdapter(new MockGridAdapter());

  let sidebarState = { collapsed: false, tab: 'overview' };
  vm.registerProvider('sidebar', {
    capture: () => ({ ...sidebarState }),
    restore: (state) => { sidebarState = state; },
  });

  sidebarState.collapsed = true;
  sidebarState.tab = 'details';
  vm.save('With Sidebar');

  sidebarState.collapsed = false;
  sidebarState.tab = 'overview';
  vm.load('With Sidebar');

  assertEqual(sidebarState.collapsed, true, 'Sidebar state should be restored');
  assertEqual(sidebarState.tab, 'details');
});

test('autoSave and autoRestore preserve state', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  const adapter = new MockGridAdapter();
  adapter._setFilters([{ colId: 'status', type: 'text', value: 'active' }]);
  vm.setGridAdapter(adapter);

  vm.autoSave();
  adapter._setFilters([]);
  vm.autoRestore();

  assertEqual(adapter._state.filters.length, 1, 'Auto-restore should bring back filters');
});

suite('ViewStateManager — Limits & Slots');

test('default maxViews is 5', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus);
  assertEqual(vm.getMaxViews(), 5);
});

test('custom maxViews via constructor', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 10 });
  assertEqual(vm.getMaxViews(), 10);
});

test('LRU eviction when exceeding maxViews', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 3 });
  vm.setGridAdapter(new MockGridAdapter());

  vm.save('View A');
  vm.save('View B');
  vm.save('View C');
  assertEqual(vm.count(), 3);

  // Manually set timestamps to make order deterministic
  // A = oldest (100), B = middle (200), C = newest (300)
  vm.get('View A').meta.lastUsed = 100;
  vm.get('View B').meta.lastUsed = 200;
  vm.get('View C').meta.lastUsed = 300;

  // Save a 4th — should evict View A (timestamp 100, least recently used)
  vm.save('View D');
  assertEqual(vm.count(), 3, 'Should still be at max');
  assert(!vm.has('View A'), 'View A should be evicted (LRU, oldest timestamp)');
  assert(vm.has('View B'), 'View B should survive');
  assert(vm.has('View D'), 'View D should exist (just saved)');
});

test('save emits event with slot and shortcut info', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 5 });
  vm.setGridAdapter(new MockGridAdapter());

  let eventData = null;
  bus.on('view:saved', (d) => { eventData = d; });

  vm.save('My View');
  assert(eventData !== null, 'Should emit view:saved');
  assertEqual(eventData.name, 'My View');
  assertEqual(eventData.slot, 1, 'First view should be slot 1');
  assertEqual(eventData.shortcut, 'Ctrl+1', 'First view shortcut should be Ctrl+1');
  assertEqual(eventData.totalSaved, 1);
  assertEqual(eventData.remaining, 4);
  assertEqual(eventData.maxViews, 5);
});

test('eviction emits event with evicted view name', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 2 });
  vm.setGridAdapter(new MockGridAdapter());

  let evicted = null;
  bus.on('view:evicted', (d) => { evicted = d; });

  vm.save('A');
  vm.save('B');
  // Make A oldest
  vm.get('A').meta.lastUsed = 100;
  vm.get('B').meta.lastUsed = 200;

  vm.save('C'); // should evict A (oldest)

  assert(evicted !== null, 'Should emit view:evicted');
  assertEqual(evicted.name, 'A');
  assertEqual(evicted.reason, 'limit');
});

test('getSlots returns all views with slot numbers', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 5 });
  vm.setGridAdapter(new MockGridAdapter());

  vm.save('Alpha');
  vm.save('Beta');
  vm.save('Gamma');

  const slots = vm.getSlots();
  assertEqual(slots.length, 3);
  assertEqual(slots[0].name, 'Alpha');
  assertEqual(slots[0].slot, 1);
  assertEqual(slots[0].shortcut, 'Ctrl+1');
  assertEqual(slots[1].shortcut, 'Ctrl+2');
  assertEqual(slots[2].shortcut, 'Ctrl+3');
});

test('setMaxViews evicts when reducing limit', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 5 });
  vm.setGridAdapter(new MockGridAdapter());

  vm.save('A'); vm.save('B'); vm.save('C'); vm.save('D');
  // Set deterministic timestamps
  vm.get('A').meta.lastUsed = 100;
  vm.get('B').meta.lastUsed = 200;
  vm.get('C').meta.lastUsed = 300;
  vm.get('D').meta.lastUsed = 400;
  assertEqual(vm.count(), 4);

  vm.setMaxViews(2);
  assertEqual(vm.count(), 2, 'Should evict down to new limit');
  assertEqual(vm.getMaxViews(), 2);
  assert(!vm.has('A'), 'Oldest should be evicted');
  assert(!vm.has('B'), 'Second oldest should be evicted');
  assert(vm.has('C'), 'Recent should survive');
  assert(vm.has('D'), 'Most recent should survive');
});

test('overwriting existing view does not trigger eviction', () => {
  const bus = new EventBus();
  const vm = new ViewStateManager(bus, { maxViews: 3 });
  vm.setGridAdapter(new MockGridAdapter());

  vm.save('A'); vm.save('B'); vm.save('C');
  assertEqual(vm.count(), 3);

  // Overwrite A — should NOT evict
  vm.save('A');
  assertEqual(vm.count(), 3);
  assert(vm.has('A'));
  assert(vm.has('B'));
  assert(vm.has('C'));
});

// ═══════════════════════════════════════════════
// SelectionModel Tests
// ═══════════════════════════════════════════════

suite('SelectionModel — Core');

test('create instance', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  assert(sel instanceof SelectionModel);
  assertEqual(sel.count(), 0);
});

test('add single item', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add('row-1');
  assertEqual(sel.count(), 1);
  assert(sel.has('row-1'));
});

test('add multiple items', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['row-1', 'row-2', 'row-3']);
  assertEqual(sel.count(), 3);
});

test('remove items', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['row-1', 'row-2', 'row-3']);
  sel.remove('row-2');
  assertEqual(sel.count(), 2);
  assert(!sel.has('row-2'));
});

test('toggle adds and removes', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.toggle('row-1');
  assert(sel.has('row-1'));
  sel.toggle('row-1');
  assert(!sel.has('row-1'));
});

test('clear empties selection', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['row-1', 'row-2']);
  sel.clear();
  assertEqual(sel.count(), 0);
});

test('all returns array of selected IDs', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['row-1', 'row-2']);
  const all = sel.all();
  assertEqual(all.length, 2);
  assert(all.includes('row-1'));
  assert(all.includes('row-2'));
});

test('selectAll uses grid adapter', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  const adapter = new MockGridAdapter();
  adapter._setRows([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  sel.setGridAdapter(adapter);
  sel.selectAll();
  assertEqual(sel.count(), 3);
});

test('where selects by predicate', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  const adapter = new MockGridAdapter();
  adapter._setRows([
    { id: 'a', spread: 300 },
    { id: 'b', spread: 550 },
    { id: 'c', spread: 200 },
    { id: 'd', spread: 600 },
  ]);
  sel.setGridAdapter(adapter);
  const matched = sel.where(row => row.spread > 500);
  assertEqual(matched, 2);
  assertEqual(sel.count(), 2);
  assert(sel.has('b'));
  assert(sel.has('d'));
});

test('where with additive', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  const adapter = new MockGridAdapter();
  adapter._setRows([
    { id: 'a', spread: 300, rating: 'B' },
    { id: 'b', spread: 550, rating: 'CCC' },
    { id: 'c', spread: 200, rating: 'BB' },
  ]);
  sel.setGridAdapter(adapter);
  sel.where(row => row.spread > 400);
  assertEqual(sel.count(), 1);
  sel.where(row => row.rating === 'BB', { additive: true });
  assertEqual(sel.count(), 2);
});

test('invert flips selection', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  const adapter = new MockGridAdapter();
  adapter._setRows([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  sel.setGridAdapter(adapter);
  sel.add('a');
  sel.invert();
  assertEqual(sel.count(), 2);
  assert(!sel.has('a'));
  assert(sel.has('b'));
  assert(sel.has('c'));
});

suite('SelectionModel — Named Selections');

test('save and load named selection', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['row-1', 'row-2', 'row-3']);
  sel.save('Watchlist');
  sel.clear();
  assertEqual(sel.count(), 0);
  sel.loadNamed('Watchlist');
  assertEqual(sel.count(), 3);
});

test('listNamed returns all saved', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['a', 'b']);
  sel.save('Set A');
  sel.clear();
  sel.add(['c', 'd', 'e']);
  sel.save('Set B');
  const list = sel.listNamed();
  assertEqual(list.length, 2);
  assert(list.some(s => s.name === 'Set A' && s.count === 2));
  assert(list.some(s => s.name === 'Set B' && s.count === 3));
});

test('deleteNamed removes saved selection', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add('x');
  sel.save('Temp');
  sel.deleteNamed('Temp');
  assertEqual(sel.listNamed().length, 0);
});

test('isInNamed checks membership', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['a', 'b']);
  sel.save('Test');
  assert(sel.isInNamed('Test', 'a'));
  assert(!sel.isInNamed('Test', 'c'));
});

suite('SelectionModel — Set Operations');

test('union combines selections', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['a', 'b']);
  sel.save('Set1');
  sel.clear();
  sel.add(['c', 'd']);
  sel.union('Set1');
  assertEqual(sel.count(), 4);
});

test('intersect keeps common items', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['a', 'b', 'c']);
  sel.save('Set1');
  sel.clear();
  sel.add(['b', 'c', 'd']);
  sel.intersect('Set1');
  assertEqual(sel.count(), 2);
  assert(sel.has('b'));
  assert(sel.has('c'));
});

test('subtract removes items', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  sel.add(['a', 'b']);
  sel.save('Remove');
  sel.clear();
  sel.add(['a', 'b', 'c', 'd']);
  sel.subtract('Remove');
  assertEqual(sel.count(), 2);
  assert(!sel.has('a'));
  assert(!sel.has('b'));
  assert(sel.has('c'));
});

test('syncs selection to grid adapter', () => {
  const bus = new EventBus();
  const sel = new SelectionModel(bus);
  const adapter = new MockGridAdapter();
  sel.setGridAdapter(adapter);
  sel.add(['x', 'y']);
  assertEqual(adapter._selected.length, 2);
  assert(adapter._selected.includes('x'));
});

// ═══════════════════════════════════════════════
// FieldRegistry Tests
// ═══════════════════════════════════════════════

suite('FieldRegistry — Core');

test('create instance', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  assert(fr instanceof FieldRegistry);
  assertEqual(fr.count(), 0);
});

test('register a field', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'issuer.name', label: 'Issuer Name', section: 'General', value: '1-800 Contacts' });
  assertEqual(fr.count(), 1);
  const field = fr.get('issuer.name');
  assertEqual(field.label, 'Issuer Name');
  assertEqual(field.section, 'General');
});

test('register returns unregister function', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  const unreg = fr.register({ id: 'test', label: 'Test' });
  assertEqual(fr.count(), 1);
  unreg();
  assertEqual(fr.count(), 0);
});

test('registerMany registers multiple fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', section: 'S1' },
    { id: 'b', label: 'B', section: 'S1' },
    { id: 'c', label: 'C', section: 'S2' },
  ]);
  assertEqual(fr.count(), 3);
});

test('getGrouped returns fields by section', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', section: 'Ratings' },
    { id: 'b', label: 'B', section: 'Ratings' },
    { id: 'c', label: 'C', section: 'ESG' },
  ]);
  const groups = fr.getGrouped();
  assert(groups.has('Ratings'));
  assert(groups.has('ESG'));
  assertEqual(groups.get('Ratings').length, 2);
  assertEqual(groups.get('ESG').length, 1);
});

suite('FieldRegistry — Search');

test('search by exact label', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'moody', label: "Moody's Corp Family Rating", section: 'Ratings' },
    { id: 'sp', label: "S&P Obligor Rating", section: 'Ratings' },
    { id: 'ticker', label: 'Ticker', section: 'General' },
  ]);
  const results = fr.search("Moody's Corp Family Rating");
  assert(results.length > 0);
  assertEqual(results[0].field.id, 'moody');
});

test('search by partial label', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'moody', label: "Moody's Corp Family Rating", section: 'Ratings' },
    { id: 'sp', label: "S&P Rating", section: 'Ratings' },
  ]);
  const results = fr.search('moody');
  assert(results.length > 0);
  assertEqual(results[0].field.id, 'moody');
});

test('search by section', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'Alpha', section: 'Ratings' },
    { id: 'b', label: 'Beta', section: 'ESG' },
  ]);
  const results = fr.search('ESG');
  assert(results.some(r => r.field.id === 'b'));
});

test('search with emptyOnly filter', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'Filled', value: 'has value' },
    { id: 'b', label: 'Empty', value: null },
    { id: 'c', label: 'Not Set', value: 'Not set' },
  ]);
  const results = fr.search('', { emptyOnly: true });
  assertEqual(results.length, 2, '"Not set" and null should both be empty');
});

suite('FieldRegistry — Navigation');

test('focusNext moves to next field', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', section: 'S1', editable: true, order: 1 },
    { id: 'b', label: 'B', section: 'S1', editable: true, order: 2 },
    { id: 'c', label: 'C', section: 'S1', editable: true, order: 3 },
  ]);
  fr._focused = 'a';
  const next = fr.focusNext({ withinSection: false });
  assertEqual(next, 'b');
});

test('focusNext skips non-editable fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', section: 'S1', editable: true, order: 1 },
    { id: 'b', label: 'B', section: 'S1', editable: false, order: 2 },
    { id: 'c', label: 'C', section: 'S1', editable: true, order: 3 },
  ]);
  fr._focused = 'a';
  const next = fr.focusNext({ withinSection: false });
  assertEqual(next, 'c', 'Should skip non-editable field B');
});

test('focusNextEmpty finds next empty field', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', section: 'S1', editable: true, value: 'filled', order: 1 },
    { id: 'b', label: 'B', section: 'S1', editable: true, value: null, order: 2 },
    { id: 'c', label: 'C', section: 'S1', editable: true, value: 'filled', order: 3 },
    { id: 'd', label: 'D', section: 'S1', editable: true, value: 'Not set', order: 4 },
  ]);
  fr._focused = 'a';
  const next = fr.focusNextEmpty();
  assertEqual(next, 'b');
});

suite('FieldRegistry — Dirty Tracking');

test('getDirty returns modified fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'a', label: 'A', value: 'original' });
  fr.markDirty('a', 'changed');
  const dirty = fr.getDirty();
  assertEqual(dirty.length, 1);
  assertEqual(dirty[0].oldValue, 'original');
  assertEqual(dirty[0].newValue, 'changed');
});

test('getDirtyCount returns count', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', value: 'v1' },
    { id: 'b', label: 'B', value: 'v2' },
    { id: 'c', label: 'C', value: 'v3' },
  ]);
  fr.markDirty('a', 'changed1');
  fr.markDirty('c', 'changed3');
  assertEqual(fr.getDirtyCount(), 2);
});

test('revert restores original value', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  let storedValue = 'original';
  fr.register({
    id: 'a', label: 'A', value: 'original',
    setValue: (v) => { storedValue = v; },
    getValue: () => storedValue,
  });
  fr.markDirty('a', 'changed');
  fr.revert('a');
  assertEqual(storedValue, 'original');
  assertEqual(fr.getDirtyCount(), 0);
});

test('acceptAll resets dirty baseline', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'a', label: 'A', value: 'v1', getValue: () => 'v2' });
  fr.markDirty('a', 'v2');
  assertEqual(fr.getDirtyCount(), 1);
  fr.acceptAll();
  assertEqual(fr.getDirtyCount(), 0);
});

suite('FieldRegistry — Empty Fields');

test('getEmpty returns empty fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', value: 'filled' },
    { id: 'b', label: 'B', value: null },
    { id: 'c', label: 'C', value: '' },
    { id: 'd', label: 'D', value: 'Not set' },
  ]);
  const empty = fr.getEmpty();
  assertEqual(empty.length, 3, 'null, empty string, and "Not set" are all empty');
});

test('getCompleteness returns stats', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A', value: 'filled', required: true },
    { id: 'b', label: 'B', value: null, required: true },
    { id: 'c', label: 'C', value: 'filled' },
    { id: 'd', label: 'D', value: null },
  ]);
  const stats = fr.getCompleteness();
  assertEqual(stats.total, 4);
  assertEqual(stats.filled, 2);
  assertEqual(stats.empty, 2);
  assertEqual(stats.required, 2);
  assertEqual(stats.requiredEmpty, 1);
  assertEqual(stats.percent, 50);
});

suite('FieldRegistry — Pinning');

test('pin and unpin fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'a', label: 'A' });
  fr.pin('a');
  assert(fr.isPinned('a'));
  fr.unpin('a');
  assert(!fr.isPinned('a'));
});

test('togglePin switches state', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'a', label: 'A' });
  fr.togglePin('a');
  assert(fr.isPinned('a'));
  fr.togglePin('a');
  assert(!fr.isPinned('a'));
});

test('getPinned returns pinned fields', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.registerMany([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ]);
  fr.pin('a');
  fr.pin('c');
  const pinned = fr.getPinned();
  assertEqual(pinned.length, 2);
});

test('getPinnedValues returns values', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'rating', label: "Moody's Rating", section: 'Ratings', value: 'B2' });
  fr.pin('rating');
  const values = fr.getPinnedValues();
  assertEqual(values.length, 1);
  assertEqual(values[0].value, 'B2');
  assertEqual(values[0].label, "Moody's Rating");
});

test('clear preserves pins', () => {
  const bus = new EventBus();
  const fr = new FieldRegistry(bus);
  fr.register({ id: 'a', label: 'A' });
  fr.pin('a');
  fr.clear();
  assert(fr.isPinned('a'), 'Pins should survive clear');
  assertEqual(fr.count(), 0, 'Fields should be cleared');
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════

console.log('\n  └─ Done');
console.log(`\n  ─────────────────────────────`);
console.log(`  ⚡ CtrlK Phase 1 Test Results`);
console.log(`  ─────────────────────────────`);
console.log(`  ✓ Passed: ${passed}`);
if (failed > 0) {
  console.log(`  ✗ Failed: ${failed}`);
}
console.log(`  Total:   ${passed + failed}`);
console.log(`  ─────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
