/**
 * CtrlK History Manager
 * ──────────────────────────────────────────────
 * Application-level undo/redo with history branching.
 * 
 * Not form-field undo. Full state transition history.
 * Every command that registers an `undo` function is
 * automatically tracked. Ctrl+Z undoes. Ctrl+Y / Ctrl+Shift+Z redoes.
 * 
 * Branching: Go back 5 actions, make a different change,
 * the old future becomes a named branch you can return to.
 * 
 * Excel parallel:
 *   - Ctrl+Z = Undo (our undo)
 *   - Ctrl+Y = Redo (our redo)
 *   - Undo dropdown showing history = our timeline()
 * 
 * Integration:
 *   Commands opt into history by providing an `undo` function:
 *   
 *   ctrlk.commands.register({
 *     id: 'field.update',
 *     execute: (fieldId, newValue) => {
 *       const old = getFieldValue(fieldId);
 *       setFieldValue(fieldId, newValue);
 *       return old; // return value is passed to undo
 *     },
 *     undo: (returnValue, fieldId, newValue) => {
 *       setFieldValue(fieldId, returnValue); // restore old value
 *     },
 *   });
 * 
 * @module @ctrlk/history
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id - Unique entry ID
 * @property {string} commandId - Command that was executed
 * @property {any[]} args - Arguments passed to execute
 * @property {any} result - Return value from execute (passed to undo)
 * @property {number} timestamp - When executed
 * @property {string} [label] - Human-readable description
 * @property {string} [branch] - Branch name (null = main)
 */

export class HistoryManager {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../core/command-registry.js').CommandRegistry} commands
   */
  constructor(bus, commands) {
    this._bus = bus;
    this._commands = commands;

    /** @type {HistoryEntry[]} Main history stack */
    this._stack = [];

    /** @type {number} Current position in the stack (-1 = no history) */
    this._position = -1;

    /** @type {Map<string, {entries: HistoryEntry[], branchedAt: number}>} Named branches */
    this._branches = new Map();

    /** @type {number} Maximum history entries before oldest are dropped */
    this._maxEntries = 200;

    /** @type {boolean} Whether we're currently undoing/redoing (prevent re-recording) */
    this._inUndoRedo = false;

    /** @type {Function|null} */
    this._commandListener = null;

    /** @type {number} Counter for unique entry IDs */
    this._counter = 0;

    /** @type {boolean} Paused — don't record while paused */
    this._paused = false;
  }

  /**
   * Initialize — start listening for undoable command executions.
   */
  init() {
    this._commandListener = this._bus.on('command:executed', (data) => {
      if (this._inUndoRedo || this._paused) return;

      // Only track commands that have undo functions
      const cmd = this._commands.get(data.id);
      if (!cmd || !cmd.undo) return;

      this._pushEntry({
        commandId: data.id,
        args: data.args || [],
        result: data.result,
        label: cmd.title,
      });
    });
  }

  // ═══════════════════════════════════════════
  // UNDO / REDO
  // ═══════════════════════════════════════════

  /**
   * Undo the last action.
   * @returns {boolean} True if something was undone
   */
  undo() {
    if (!this.canUndo()) return false;

    const entry = this._stack[this._position];
    const cmd = this._commands.get(entry.commandId);

    if (!cmd || !cmd.undo) {
      console.warn(`[CtrlK] Cannot undo "${entry.commandId}" — no undo function`);
      return false;
    }

    this._inUndoRedo = true;
    try {
      // Call undo with: (result from execute, ...original args)
      cmd.undo(entry.result, ...entry.args);
    } catch (err) {
      console.error(`[CtrlK] Undo failed for "${entry.commandId}":`, err);
      this._inUndoRedo = false;
      return false;
    }
    this._inUndoRedo = false;

    this._position--;

    this._bus.emit('history:undo', {
      commandId: entry.commandId,
      label: entry.label,
      position: this._position,
      total: this._stack.length,
    });

    return true;
  }

  /**
   * Redo the next action.
   * @returns {boolean} True if something was redone
   */
  redo() {
    if (!this.canRedo()) return false;

    this._position++;
    const entry = this._stack[this._position];
    const cmd = this._commands.get(entry.commandId);

    if (!cmd) {
      console.warn(`[CtrlK] Cannot redo "${entry.commandId}" — command not found`);
      this._position--;
      return false;
    }

    this._inUndoRedo = true;
    try {
      const result = cmd.execute(...entry.args);
      entry.result = result; // Update result in case it changed
    } catch (err) {
      console.error(`[CtrlK] Redo failed for "${entry.commandId}":`, err);
      this._position--;
      this._inUndoRedo = false;
      return false;
    }
    this._inUndoRedo = false;

    this._bus.emit('history:redo', {
      commandId: entry.commandId,
      label: entry.label,
      position: this._position,
      total: this._stack.length,
    });

    return true;
  }

  /**
   * Check if undo is available.
   * @returns {boolean}
   */
  canUndo() {
    return this._position >= 0;
  }

  /**
   * Check if redo is available.
   * @returns {boolean}
   */
  canRedo() {
    return this._position < this._stack.length - 1;
  }

  // ═══════════════════════════════════════════
  // TIMELINE — History visualization
  // ═══════════════════════════════════════════

  /**
   * Get the full history timeline.
   * @param {Object} [options]
   * @param {number} [options.limit] - Max entries to return
   * @returns {Array<HistoryEntry & {isCurrent: boolean, canUndo: boolean}>}
   */
  timeline(options = {}) {
    const { limit } = options;
    let entries = this._stack.map((entry, idx) => ({
      ...entry,
      isCurrent: idx === this._position,
      canUndo: idx <= this._position,
    }));

    if (limit) {
      // Show entries around current position
      const start = Math.max(0, this._position - Math.floor(limit / 2));
      entries = entries.slice(start, start + limit);
    }

    return entries;
  }

  /**
   * Jump to a specific point in history.
   * @param {string} entryId - The history entry ID to jump to
   * @returns {boolean}
   */
  jumpTo(entryId) {
    const targetIdx = this._stack.findIndex(e => e.id === entryId);
    if (targetIdx === -1) return false;

    // Need to undo or redo to reach the target
    if (targetIdx < this._position) {
      // Undo forward from current to target
      while (this._position > targetIdx) {
        if (!this.undo()) break;
      }
    } else if (targetIdx > this._position) {
      // Redo forward from current to target
      while (this._position < targetIdx) {
        if (!this.redo()) break;
      }
    }

    return this._position === targetIdx;
  }

  // ═══════════════════════════════════════════
  // BRANCHING — Divergent history paths
  // ═══════════════════════════════════════════

  /**
   * Create a named branch at the current position.
   * Saves the "future" (entries after current position) as a branch
   * so it can be restored later if the user goes down a different path.
   * 
   * @param {string} [name] - Branch name (auto-generated if omitted)
   * @returns {string} Branch name
   */
  branch(name) {
    const branchName = name || `branch-${Date.now()}`;

    // Save everything after current position as the branch
    const futureEntries = this._stack.slice(this._position + 1);
    this._branches.set(branchName, {
      entries: futureEntries,
      branchedAt: this._position,
    });

    // Trim the stack to current position
    this._stack = this._stack.slice(0, this._position + 1);

    this._bus.emit('history:branched', {
      name: branchName,
      savedEntries: futureEntries.length,
      position: this._position,
    });

    return branchName;
  }

  /**
   * Restore a branch — undo back to the branch point and replay the branch.
   * @param {string} name - Branch name
   * @returns {boolean}
   */
  restoreBranch(name) {
    const branch = this._branches.get(name);
    if (!branch) return false;

    // Undo back to the branch point
    while (this._position > branch.branchedAt) {
      if (!this.undo()) break;
    }

    // Save current future as a new branch (so we don't lose it)
    const currentFuture = this._stack.slice(this._position + 1);
    if (currentFuture.length > 0) {
      this._branches.set(`pre-restore-${Date.now()}`, {
        entries: currentFuture,
        branchedAt: this._position,
      });
    }

    // Replace future with branch entries
    this._stack = this._stack.slice(0, this._position + 1).concat(branch.entries);

    // Redo all branch entries
    while (this.canRedo()) {
      if (!this.redo()) break;
    }

    this._bus.emit('history:branch-restored', { name, entries: branch.entries.length });
    return true;
  }

  /**
   * List all branches.
   * @returns {Array<{name: string, entryCount: number, branchedAt: number}>}
   */
  listBranches() {
    return Array.from(this._branches.entries()).map(([name, branch]) => ({
      name,
      entryCount: branch.entries.length,
      branchedAt: branch.branchedAt,
    }));
  }

  /**
   * Delete a branch.
   * @param {string} name
   * @returns {boolean}
   */
  deleteBranch(name) {
    return this._branches.delete(name);
  }

  // ═══════════════════════════════════════════
  // COMPARE — Diff between states
  // ═══════════════════════════════════════════

  /**
   * Get the changes between two points in history.
   * @param {number} fromPosition - Start position
   * @param {number} toPosition - End position
   * @returns {HistoryEntry[]} Entries between the two positions
   */
  diff(fromPosition, toPosition) {
    const start = Math.min(fromPosition, toPosition);
    const end = Math.max(fromPosition, toPosition);
    return this._stack.slice(start + 1, end + 1);
  }

  // ═══════════════════════════════════════════
  // CONTROL
  // ═══════════════════════════════════════════

  /**
   * Pause history recording (e.g., during batch operations).
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume history recording.
   */
  resume() {
    this._paused = false;
  }

  /**
   * Clear all history.
   */
  clear() {
    this._stack = [];
    this._position = -1;
    this._branches.clear();
    this._bus.emit('history:cleared', {});
  }

  /**
   * Get current state.
   * @returns {{position: number, total: number, canUndo: boolean, canRedo: boolean, branches: number}}
   */
  getState() {
    return {
      position: this._position,
      total: this._stack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      branches: this._branches.size,
    };
  }

  /**
   * Destroy — clean up listeners.
   */
  destroy() {
    if (this._commandListener) {
      this._commandListener();
      this._commandListener = null;
    }
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Push a new entry to the stack */
  _pushEntry({ commandId, args, result, label }) {
    // If we're not at the end of the stack, we're creating a new branch
    // Automatically save the future as an unnamed branch
    if (this._position < this._stack.length - 1) {
      const future = this._stack.slice(this._position + 1);
      if (future.length > 0) {
        this._branches.set(`auto-${Date.now()}`, {
          entries: future,
          branchedAt: this._position,
        });
      }
      // Trim stack to current position
      this._stack = this._stack.slice(0, this._position + 1);
    }

    const entry = {
      id: `h-${++this._counter}`,
      commandId,
      args: args || [],
      result,
      timestamp: Date.now(),
      label: label || commandId,
      branch: null,
    };

    this._stack.push(entry);
    this._position = this._stack.length - 1;

    // Enforce max entries
    if (this._stack.length > this._maxEntries) {
      const excess = this._stack.length - this._maxEntries;
      this._stack.splice(0, excess);
      this._position -= excess;
    }

    this._bus.emit('history:pushed', {
      entry,
      position: this._position,
      total: this._stack.length,
    });
  }
}
