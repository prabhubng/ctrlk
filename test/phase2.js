/**
 * CtrlK Phase 2 Test Suite
 * ──────────────────────────────────────────────
 * Tests: MacroEngine, HistoryManager, AgGridAdapter
 * Run: node test/phase2.js
 */

// ─── Minimal EventBus ───
class EventBus {
  constructor() { this._l = new Map(); }
  on(e, h) { if (!this._l.has(e)) this._l.set(e, new Set()); this._l.get(e).add(h); return () => this._l.get(e)?.delete(h); }
  emit(e, d) { const l = this._l.get(e); if (l) for (const h of l) { try { h(d, e); } catch (err) { /* */ } } }
  off(e) { if (!e) this._l.clear(); else this._l.delete(e); }
}

// ─── Minimal CommandRegistry ───
class CommandRegistry {
  constructor(bus) { this._bus = bus; this._cmds = new Map(); }
  register(d) { const cmd = { ...d, when: d.when || null }; this._cmds.set(d.id, cmd); return () => this._cmds.delete(d.id); }
  unregister(id) { this._cmds.delete(id); }
  execute(id, ...args) {
    const cmd = this._cmds.get(id);
    if (!cmd) return;
    if (cmd.when && !cmd.when()) return;
    const result = cmd.execute(...args);
    this._bus.emit('command:executed', { id, args, result, timestamp: Date.now() });
    return result;
  }
  get(id) { return this._cmds.get(id); }
  has(id) { return this._cmds.has(id); }
}

// ─── Mock localStorage ───
const mockStorage = {};
globalThis.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; },
  removeItem: (k) => { delete mockStorage[k]; },
};

import { MacroEngine } from '../src/macro/macro-engine.js';
import { HistoryManager } from '../src/history/history-manager.js';

// ─── Test harness ───
let passed = 0, failed = 0;
function suite(name) { console.log(`\n  ┌─ ${name}`); }
function test(name, fn) {
  try { fn(); passed++; console.log(`  │  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  │  ✗ ${name}`); console.log(`  │    ${err.message}`); }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  │  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  │  ✗ ${name}`); console.log(`  │    ${err.message}`); }
}
function assert(c, m = 'Assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m) { if (a !== b) throw new Error(m || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ═══════════════════════════════════════════════
// MacroEngine Tests
// ═══════════════════════════════════════════════

suite('MacroEngine — Core');

test('create instance', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  assert(macro instanceof MacroEngine);
});

test('record and stop captures steps', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  // Register some commands
  let filterValue = null;
  cmds.register({ id: 'filter.set', title: 'Set Filter', execute: (val) => { filterValue = val; } });
  cmds.register({ id: 'export.csv', title: 'Export CSV', execute: () => 'exported' });

  macro.record('Test Macro');
  assert(macro.isRecording(), 'Should be recording');

  cmds.execute('filter.set', 'active');
  cmds.execute('export.csv');

  const result = macro.stop();
  assert(!macro.isRecording(), 'Should stop recording');
  assert(result !== null);
  assertEqual(result.name, 'Test Macro');
  assertEqual(result.steps.length, 2, 'Should have 2 steps');
  assertEqual(result.steps[0].commandId, 'filter.set');
  assertEqual(result.steps[1].commandId, 'export.csv');
});

test('recording skips macro commands themselves', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'user.action', title: 'User Action', execute: () => {} });
  // Register a macro command that would be skipped
  cmds.register({ id: 'ctrlk.palette', title: 'Palette', execute: () => {} });

  macro.record('Skip Test');
  cmds.execute('user.action');
  cmds.execute('ctrlk.palette'); // Should be skipped
  cmds.execute('user.action');

  const result = macro.stop();
  assertEqual(result.steps.length, 2, 'Macro/palette commands should be skipped');
});

test('cancel discards recording', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  macro.record('Cancel Test');
  macro.cancel();
  assert(!macro.isRecording());
  assert(macro.get('Cancel Test') === undefined, 'Cancelled macro should not be saved');
});

test('getRecordingState returns state during recording', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'test', title: 'Test', execute: () => {} });

  assert(macro.getRecordingState() === null);
  macro.record('State Test');
  cmds.execute('test');
  cmds.execute('test');

  const state = macro.getRecordingState();
  assertEqual(state.name, 'State Test');
  assertEqual(state.stepCount, 2);
  macro.stop();
});

suite('MacroEngine — Playback');

await testAsync('play replays steps', async () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  const log = [];
  cmds.register({ id: 'step1', title: 'Step 1', execute: () => { log.push('s1'); } });
  cmds.register({ id: 'step2', title: 'Step 2', execute: () => { log.push('s2'); } });

  macro.record('Play Test');
  cmds.execute('step1');
  cmds.execute('step2');
  macro.stop();

  log.length = 0; // Clear log
  const success = await macro.play('Play Test', { instant: true });
  assert(success, 'Playback should succeed');
  assertEqual(log.length, 2);
  assertEqual(log[0], 's1');
  assertEqual(log[1], 's2');
});

await testAsync('play updates runCount', async () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'x', title: 'X', execute: () => {} });

  macro.record('Count Test');
  cmds.execute('x');
  macro.stop();

  await macro.play('Count Test', { instant: true });
  await macro.play('Count Test', { instant: true });

  const m = macro.get('Count Test');
  assertEqual(m.runCount, 2);
  assert(m.lastRun > 0);
});

await testAsync('play returns false for unknown macro', async () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  const result = await macro.play('nonexistent');
  assert(!result);
});

suite('MacroEngine — Management');

test('list returns all macros', () => {
  // Clear storage for isolation
  delete mockStorage['ctrlk-macros'];
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'x', title: 'X', execute: () => {} });

  macro.record('A'); cmds.execute('x'); macro.stop();
  macro.record('B'); cmds.execute('x'); macro.stop();

  const list = macro.list({ sortBy: 'name' });
  const userMacros = list.filter(m => m.name === 'A' || m.name === 'B');
  assertEqual(userMacros.length, 2);
  assertEqual(userMacros[0].name, 'A');
  assertEqual(userMacros[1].name, 'B');
});

test('delete removes macro', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'x', title: 'X', execute: () => {} });
  macro.record('Delete Me'); cmds.execute('x'); macro.stop();

  assert(macro.get('Delete Me') !== undefined);
  macro.delete('Delete Me');
  assert(macro.get('Delete Me') === undefined);
});

test('rename changes macro name', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'x', title: 'X', execute: () => {} });
  macro.record('Old'); cmds.execute('x'); macro.stop();
  macro.rename('Old', 'New');

  assert(macro.get('Old') === undefined);
  assert(macro.get('New') !== undefined);
});

test('export and import', () => {
  delete mockStorage['ctrlk-macros'];
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'x', title: 'X', execute: () => {} });
  macro.record('Export'); cmds.execute('x'); cmds.execute('x'); macro.stop();

  const json = macro.export('Export');
  const parsed = JSON.parse(json);
  assertEqual(parsed.name, 'Export');
  assertEqual(parsed.steps.length, 2);

  // Import into a fresh instance
  delete mockStorage['ctrlk-macros'];
  const bus2 = new EventBus();
  const cmds2 = new CommandRegistry(bus2);
  const macro2 = new MacroEngine(bus2, cmds2);
  macro2.init();
  macro2.import(json);
  assert(macro2.get('Export') !== undefined);
});

test('edit modifies steps', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const macro = new MacroEngine(bus, cmds);
  macro.init();

  cmds.register({ id: 'a', title: 'A', execute: () => {} });
  cmds.register({ id: 'b', title: 'B', execute: () => {} });
  cmds.register({ id: 'c', title: 'C', execute: () => {} });

  macro.record('Edit'); cmds.execute('a'); cmds.execute('b'); cmds.execute('c'); macro.stop();
  assertEqual(macro.get('Edit').steps.length, 3);

  // Remove the middle step
  macro.edit('Edit', (steps) => steps.filter((_, i) => i !== 1));
  assertEqual(macro.get('Edit').steps.length, 2);
  assertEqual(macro.get('Edit').steps[0].commandId, 'a');
  assertEqual(macro.get('Edit').steps[1].commandId, 'c');
});

// ═══════════════════════════════════════════════
// HistoryManager Tests
// ═══════════════════════════════════════════════

suite('HistoryManager — Core');

test('create instance', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  assert(hist instanceof HistoryManager);
});

test('undo reverts undoable command', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 'original';
  cmds.register({
    id: 'set', title: 'Set Value',
    execute: (v) => { const old = value; value = v; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('set', 'changed');
  assertEqual(value, 'changed');

  hist.undo();
  assertEqual(value, 'original', 'Should revert to original');
});

test('redo re-applies after undo', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 'a';
  cmds.register({
    id: 'set', title: 'Set',
    execute: (v) => { const old = value; value = v; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('set', 'b');
  assertEqual(value, 'b');
  hist.undo();
  assertEqual(value, 'a');
  hist.redo();
  assertEqual(value, 'b', 'Should redo to b');
});

test('multiple undo/redo', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 0;
  cmds.register({
    id: 'inc', title: 'Increment',
    execute: () => { const old = value; value++; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('inc'); // value = 1
  cmds.execute('inc'); // value = 2
  cmds.execute('inc'); // value = 3
  assertEqual(value, 3);

  hist.undo(); assertEqual(value, 2);
  hist.undo(); assertEqual(value, 1);
  hist.undo(); assertEqual(value, 0);
  assert(!hist.canUndo(), 'No more undo');

  hist.redo(); assertEqual(value, 1);
  hist.redo(); assertEqual(value, 2);
  hist.redo(); assertEqual(value, 3);
  assert(!hist.canRedo(), 'No more redo');
});

test('non-undoable commands are not tracked', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'navigate', title: 'Navigate', execute: () => {} }); // no undo
  cmds.execute('navigate');

  assert(!hist.canUndo(), 'Non-undoable commands should not be in history');
});

test('new action after undo discards redo stack', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 0;
  cmds.register({
    id: 'set', title: 'Set',
    execute: (v) => { const old = value; value = v; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('set', 1);
  cmds.execute('set', 2);
  cmds.execute('set', 3);
  hist.undo(); // value = 2
  hist.undo(); // value = 1

  cmds.execute('set', 99); // New action — discards 2, 3

  assertEqual(value, 99);
  assert(!hist.canRedo(), 'Redo should not be available after new action');
  hist.undo();
  assertEqual(value, 1, 'Undo should go to before the new action');
});

test('canUndo and canRedo state', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({
    id: 'x', title: 'X',
    execute: () => 'r',
    undo: () => {},
  });

  assert(!hist.canUndo());
  assert(!hist.canRedo());

  cmds.execute('x');
  assert(hist.canUndo());
  assert(!hist.canRedo());

  hist.undo();
  assert(!hist.canUndo());
  assert(hist.canRedo());
});

test('getState returns current state', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'x', title: 'X', execute: () => 'r', undo: () => {} });
  cmds.execute('x');
  cmds.execute('x');

  const state = hist.getState();
  assertEqual(state.total, 2);
  assertEqual(state.position, 1);
  assert(state.canUndo);
  assert(!state.canRedo);
  assertEqual(state.branches, 0);
});

test('timeline returns entries with position markers', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'x', title: 'Step X', execute: () => 'r', undo: () => {} });
  cmds.execute('x');
  cmds.execute('x');
  cmds.execute('x');
  hist.undo();

  const tl = hist.timeline();
  assertEqual(tl.length, 3);
  assert(!tl[0].isCurrent);
  assert(tl[1].isCurrent, 'Position 1 should be current after one undo');
  assert(!tl[2].isCurrent);
});

test('clear resets history', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'x', title: 'X', execute: () => 'r', undo: () => {} });
  cmds.execute('x');
  cmds.execute('x');
  hist.clear();

  assertEqual(hist.getState().total, 0);
  assert(!hist.canUndo());
});

test('pause and resume stops/starts recording', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'x', title: 'X', execute: () => 'r', undo: () => {} });

  cmds.execute('x'); // recorded
  hist.pause();
  cmds.execute('x'); // NOT recorded
  cmds.execute('x'); // NOT recorded
  hist.resume();
  cmds.execute('x'); // recorded

  assertEqual(hist.getState().total, 2, 'Only 2 should be recorded (paused in between)');
});

suite('HistoryManager — Branching');

test('branch saves future entries', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 0;
  cmds.register({
    id: 'set', title: 'Set',
    execute: (v) => { const old = value; value = v; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('set', 1);
  cmds.execute('set', 2);
  cmds.execute('set', 3);
  hist.undo(); // back to 2
  hist.undo(); // back to 1

  const branchName = hist.branch('my-branch');
  assertEqual(branchName, 'my-branch');

  const branches = hist.listBranches();
  assertEqual(branches.length, 1);
  assertEqual(branches[0].name, 'my-branch');
  assertEqual(branches[0].entryCount, 2, 'Branch should have saved 2 future entries');
});

test('restoreBranch replays saved entries', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  let value = 0;
  cmds.register({
    id: 'set', title: 'Set',
    execute: (v) => { const old = value; value = v; return old; },
    undo: (old) => { value = old; },
  });

  cmds.execute('set', 1);
  cmds.execute('set', 2);
  cmds.execute('set', 3);

  // Go back and branch
  hist.undo(); // 2
  hist.undo(); // 1
  hist.branch('path-a');

  // Take a different path
  cmds.execute('set', 10);
  cmds.execute('set', 20);
  assertEqual(value, 20);

  // Restore original branch
  hist.restoreBranch('path-a');
  assertEqual(value, 3, 'Should restore to end of branch (value 3)');
});

test('deleteBranch removes saved branch', () => {
  const bus = new EventBus();
  const cmds = new CommandRegistry(bus);
  const hist = new HistoryManager(bus, cmds);
  hist.init();

  cmds.register({ id: 'x', title: 'X', execute: () => 'r', undo: () => {} });
  cmds.execute('x');
  cmds.execute('x');
  hist.undo();
  hist.branch('temp');

  assertEqual(hist.listBranches().length, 1);
  hist.deleteBranch('temp');
  assertEqual(hist.listBranches().length, 0);
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════

console.log('\n  └─ Done');
console.log(`\n  ─────────────────────────────`);
console.log(`  ⚡ CtrlK Phase 2 Test Results`);
console.log(`  ─────────────────────────────`);
console.log(`  ✓ Passed: ${passed}`);
if (failed > 0) {
  console.log(`  ✗ Failed: ${failed}`);
}
console.log(`  Total:   ${passed + failed}`);
console.log(`  ─────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
