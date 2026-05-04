/**
 * CtrlK Command Registry — Every app action as a named, invocable command.
 * Fuzzy search, when predicates, execution logging.
 * @module @ctrlk/core/command-registry
 */
export class CommandRegistry {
  constructor(bus) {
    this._bus = bus;
    this._commands = new Map();
    this._executionLog = [];
    this._logLimit = 500;
  }
  register(def) {
    if (!def.id || typeof def.id !== 'string') throw new Error('[CtrlK] Command must have a string id');
    if (typeof def.execute !== 'function') throw new Error(`[CtrlK] Command "${def.id}" must have an execute function`);
    if (this._commands.has(def.id)) console.warn(`[CtrlK] Command "${def.id}" already registered — overwriting`);
    const command = { id: def.id, title: def.title || def.id, category: def.category || 'General', execute: def.execute,
      when: def.when || null, undo: def.undo || null, icon: def.icon || null, shortcut: def.shortcut || null,
      description: def.description || null, _registeredAt: Date.now() };
    this._commands.set(def.id, command);
    this._bus.emit('command:registered', { id: def.id, title: command.title, category: command.category });
    return () => this.unregister(def.id);
  }
  registerMany(defs) { const u = defs.map(d => this.register(d)); return () => u.forEach(fn => fn()); }
  unregister(id) { if (this._commands.delete(id)) this._bus.emit('command:unregistered', { id }); }
  execute(id, ...args) {
    const cmd = this._commands.get(id);
    if (!cmd) { console.warn(`[CtrlK] Command not found: "${id}"`); return undefined; }
    if (cmd.when && !cmd.when()) { console.warn(`[CtrlK] Command "${id}" not available in current context`); return undefined; }
    let result;
    try { result = cmd.execute(...args); } catch (err) { console.error(`[CtrlK] Error executing "${id}":`, err); this._bus.emit('command:error', { id, error: err, args }); throw err; }
    const entry = { id, args, timestamp: Date.now(), result, undoable: !!cmd.undo };
    this._executionLog.push(entry);
    if (this._executionLog.length > this._logLimit) this._executionLog.shift();
    this._bus.emit('command:executed', entry);
    return result;
  }
  get(id) { return this._commands.get(id); }
  has(id) { return this._commands.has(id); }
  getAvailable() { return [...this._commands.values()].filter(c => !c.when || c.when()); }
  getAll() { return Array.from(this._commands.values()); }
  search(query, options = {}) {
    const { onlyAvailable = true, limit = 20 } = options;
    const cmds = onlyAvailable ? this.getAvailable() : this.getAll();
    const q = (query || '').toLowerCase().trim();
    if (!q) return cmds.slice(0, limit).map(c => ({ command: c, score: 0, matches: [] }));
    const results = [];
    for (const cmd of cmds) {
      const { score, matches } = this._scoreCommand(cmd, q);
      if (score > 0) results.push({ command: cmd, score, matches });
    }
    return results.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title)).slice(0, limit);
  }
  getGrouped(onlyAvailable = true) {
    const cmds = onlyAvailable ? this.getAvailable() : this.getAll();
    const groups = new Map();
    for (const cmd of cmds) { if (!groups.has(cmd.category)) groups.set(cmd.category, []); groups.get(cmd.category).push(cmd); }
    return groups;
  }
  getLog(limit = 50) { return this._executionLog.slice(-limit); }
  clear() { this._commands.clear(); this._bus.emit('command:cleared', {}); }
  _scoreCommand(cmd, q) {
    let score = 0; const matches = [];
    const fields = [{ text: cmd.title, weight: 10 }, { text: cmd.id, weight: 6 }, { text: cmd.category, weight: 4 }, { text: cmd.description || '', weight: 3 }];
    for (const { text, weight } of fields) {
      const lower = text.toLowerCase();
      if (lower === q) { score += weight * 10; matches.push(text); }
      else if (lower.startsWith(q)) { score += weight * 5; matches.push(text); }
      else if (lower.includes(q)) { score += weight * 3; matches.push(text); }
      else { const words = lower.split(/[\s.\-_:]+/); for (const w of words) { if (w.startsWith(q)) { score += weight * 2; matches.push(text); break; } }
        if (score === 0 && this._fuzzyMatch(lower, q)) { score += weight; matches.push(text); } }
    }
    return { score, matches };
  }
  _fuzzyMatch(text, query) { let qi = 0; for (let i = 0; i < text.length && qi < query.length; i++) { if (text[i] === query[qi]) qi++; } return qi === query.length; }
}
