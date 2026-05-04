/**
 * CtrlK Macro Engine
 * ──────────────────────────────────────────────
 * Record, parameterize, and replay sequences of command executions.
 * 
 * Macros are first-class: they register as commands, appear in the
 * palette, and can be bound to keyboard shortcuts.
 * 
 * Excel parallel:
 *   - Alt+T+M+R = Record Macro
 *   - Alt+T+M+S = Stop Recording
 *   - Alt+F8 = View Macros
 *   - Assign to shortcut = bind to key
 * 
 * Workflow:
 *   1. ctrlk.macro.record('Monday Report')
 *   2. User performs actions (filter, sort, export) — each command:executed event is captured
 *   3. ctrlk.macro.stop()
 *   4. ctrlk.macro.play('Monday Report') — replays all steps
 *   5. The macro appears in Ctrl+K palette as "▶ Monday Report"
 * 
 * Macros capture command IDs and their arguments.
 * They do NOT capture mouse movements or DOM interactions.
 * This is intentional — macros are command-level, not UI-level.
 * 
 * @module @ctrlk/macro
 * @author Prabhu Raja
 */

const STORAGE_KEY = 'ctrlk-macros';

/**
 * @typedef {Object} MacroStep
 * @property {string} commandId - Command that was executed
 * @property {any[]} args - Arguments passed to the command
 * @property {number} delay - Milliseconds since previous step (for pacing)
 * @property {number} timestamp - When this step was recorded
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name - Macro name
 * @property {string} [description] - What this macro does
 * @property {MacroStep[]} steps - Recorded command sequence
 * @property {number} createdAt - When recorded
 * @property {number} [lastRun] - Last playback timestamp
 * @property {number} runCount - How many times played
 * @property {string} [shortcut] - Bound keyboard shortcut
 */

export class MacroEngine {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../core/command-registry.js').CommandRegistry} commands
   */
  constructor(bus, commands) {
    this._bus = bus;
    this._commands = commands;

    /** @type {Map<string, MacroDefinition>} */
    this._macros = new Map();

    /** @type {boolean} Currently recording */
    this._recording = false;

    /** @type {string|null} Name of macro being recorded */
    this._recordingName = null;

    /** @type {MacroStep[]} Steps captured during recording */
    this._recordingSteps = [];

    /** @type {number} Timestamp of last recorded step */
    this._lastStepTime = 0;

    /** @type {Function|null} Event listener cleanup */
    this._recordListener = null;

    /** @type {boolean} Currently playing */
    this._playing = false;

    /** @type {string|null} Name of macro being played */
    this._playingName = null;

    /** @type {Set<string>} Command IDs to skip during recording (macro commands themselves) */
    this._skipCommands = new Set([
      'ctrlk.macro.record', 'ctrlk.macro.stop', 'ctrlk.macro.play',
      'ctrlk.macro.list', 'ctrlk.palette', 'ctrlk.shortcuts',
    ]);
  }

  /**
   * Initialize — load macros from storage, register macro commands.
   */
  init() {
    this._loadFromStorage();
    this._registerMacroCommands();
    this._registerSavedMacrosAsCommands();
  }

  // ═══════════════════════════════════════════
  // RECORD
  // ═══════════════════════════════════════════

  /**
   * Start recording a macro.
   * @param {string} name - Name for the macro
   */
  record(name) {
    if (this._recording) {
      console.warn('[CtrlK] Already recording. Stop the current recording first.');
      return;
    }
    if (!name) {
      throw new Error('[CtrlK] Macro name is required');
    }

    this._recording = true;
    this._recordingName = name;
    this._recordingSteps = [];
    this._lastStepTime = Date.now();

    // Listen for command executions
    this._recordListener = this._bus.on('command:executed', (data) => {
      if (!this._recording) return;
      if (this._playing) return; // Don't record playback
      if (this._skipCommands.has(data.id)) return;

      const now = Date.now();
      this._recordingSteps.push({
        commandId: data.id,
        args: data.args || [],
        delay: now - this._lastStepTime,
        timestamp: now,
      });
      this._lastStepTime = now;

      this._bus.emit('macro:step-recorded', {
        macro: this._recordingName,
        step: this._recordingSteps.length,
        commandId: data.id,
      });
    });

    this._bus.emit('macro:recording-started', { name });
  }

  /**
   * Stop recording and save the macro.
   * @returns {MacroDefinition|null}
   */
  stop() {
    if (!this._recording) {
      console.warn('[CtrlK] Not currently recording.');
      return null;
    }

    // Clean up listener
    if (this._recordListener) {
      this._recordListener();
      this._recordListener = null;
    }

    const macro = {
      name: this._recordingName,
      description: '',
      steps: [...this._recordingSteps],
      createdAt: Date.now(),
      lastRun: null,
      runCount: 0,
      shortcut: null,
    };

    this._macros.set(macro.name, macro);
    this._persistToStorage();

    // Register as a command
    this._registerMacroAsCommand(macro);

    this._recording = false;
    const name = this._recordingName;
    this._recordingName = null;
    this._recordingSteps = [];

    this._bus.emit('macro:recording-stopped', { name, stepCount: macro.steps.length });
    return macro;
  }

  /**
   * Cancel the current recording without saving.
   */
  cancel() {
    if (!this._recording) return;

    if (this._recordListener) {
      this._recordListener();
      this._recordListener = null;
    }

    this._recording = false;
    this._recordingName = null;
    this._recordingSteps = [];
    this._bus.emit('macro:recording-cancelled', {});
  }

  /**
   * Check if currently recording.
   * @returns {boolean}
   */
  isRecording() {
    return this._recording;
  }

  /**
   * Get the current recording state.
   * @returns {{name: string, stepCount: number}|null}
   */
  getRecordingState() {
    if (!this._recording) return null;
    return { name: this._recordingName, stepCount: this._recordingSteps.length };
  }

  // ═══════════════════════════════════════════
  // PLAY
  // ═══════════════════════════════════════════

  /**
   * Play a macro.
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.instant=false] - Skip delays between steps
   * @param {Object} [options.params] - Parameter overrides (for parameterized macros)
   * @returns {Promise<boolean>} True if completed successfully
   */
  async play(name, options = {}) {
    const { instant = false, params = {} } = options;

    const macro = this._macros.get(name);
    if (!macro) {
      console.warn(`[CtrlK] Macro not found: "${name}"`);
      return false;
    }

    if (macro.steps.length === 0) {
      console.warn(`[CtrlK] Macro "${name}" has no steps`);
      return false;
    }

    this._playing = true;
    this._playingName = name;

    this._bus.emit('macro:playback-started', { name, totalSteps: macro.steps.length });

    try {
      for (let i = 0; i < macro.steps.length; i++) {
        const step = macro.steps[i];

        // Wait for delay (unless instant mode)
        if (!instant && step.delay > 0 && i > 0) {
          await this._delay(Math.min(step.delay, 2000)); // Cap at 2 seconds
        }

        // Execute the command
        const args = this._resolveParams(step.args, params);
        this._commands.execute(step.commandId, ...args);

        this._bus.emit('macro:step-played', {
          macro: name,
          step: i + 1,
          total: macro.steps.length,
          commandId: step.commandId,
        });
      }
    } catch (err) {
      console.error(`[CtrlK] Macro "${name}" failed at step:`, err);
      this._bus.emit('macro:playback-error', { name, error: err.message });
      this._playing = false;
      this._playingName = null;
      return false;
    }

    // Update stats
    macro.lastRun = Date.now();
    macro.runCount++;
    this._persistToStorage();

    this._playing = false;
    this._playingName = null;
    this._bus.emit('macro:playback-completed', { name, steps: macro.steps.length });
    return true;
  }

  /**
   * Check if currently playing.
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing;
  }

  // ═══════════════════════════════════════════
  // MANAGE
  // ═══════════════════════════════════════════

  /**
   * Get a macro definition.
   * @param {string} name
   * @returns {MacroDefinition|undefined}
   */
  get(name) {
    return this._macros.get(name);
  }

  /**
   * List all macros.
   * @param {Object} [options]
   * @param {string} [options.sortBy='lastRun'] - 'lastRun', 'name', 'runCount', 'createdAt'
   * @returns {MacroDefinition[]}
   */
  list(options = {}) {
    const { sortBy = 'lastRun' } = options;
    const macros = Array.from(this._macros.values());

    if (sortBy === 'name') macros.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'runCount') macros.sort((a, b) => b.runCount - a.runCount);
    else if (sortBy === 'createdAt') macros.sort((a, b) => b.createdAt - a.createdAt);
    else macros.sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0));

    return macros;
  }

  /**
   * Delete a macro.
   * @param {string} name
   * @returns {boolean}
   */
  delete(name) {
    const deleted = this._macros.delete(name);
    if (deleted) {
      // Unregister the command
      try { this._commands.unregister(`macro.${this._slugify(name)}`); } catch (e) { /* silent */ }
      this._persistToStorage();
      this._bus.emit('macro:deleted', { name });
    }
    return deleted;
  }

  /**
   * Rename a macro.
   * @param {string} oldName
   * @param {string} newName
   */
  rename(oldName, newName) {
    const macro = this._macros.get(oldName);
    if (!macro) return false;
    macro.name = newName;
    this._macros.delete(oldName);
    this._macros.set(newName, macro);
    this._persistToStorage();
    this._bus.emit('macro:renamed', { oldName, newName });
    return true;
  }

  /**
   * Edit a macro's steps (remove, reorder).
   * @param {string} name
   * @param {Function} editor - Receives steps array, returns modified steps
   * @returns {boolean}
   */
  edit(name, editor) {
    const macro = this._macros.get(name);
    if (!macro) return false;
    macro.steps = editor([...macro.steps]);
    this._persistToStorage();
    this._bus.emit('macro:edited', { name, stepCount: macro.steps.length });
    return true;
  }

  /**
   * Set the description of a macro.
   * @param {string} name
   * @param {string} description
   */
  setDescription(name, description) {
    const macro = this._macros.get(name);
    if (macro) {
      macro.description = description;
      this._persistToStorage();
    }
  }

  /**
   * Bind a macro to a keyboard shortcut.
   * @param {string} name
   * @param {string} shortcut
   */
  bindShortcut(name, shortcut) {
    const macro = this._macros.get(name);
    if (!macro) return;
    macro.shortcut = shortcut;
    const cmdId = `macro.${this._slugify(name)}`;
    // The keys module handles the binding
    this._bus.emit('macro:shortcut-bound', { name, shortcut, commandId: cmdId });
    this._persistToStorage();
  }

  /**
   * Export a macro as JSON (shareable).
   * @param {string} name
   * @returns {string}
   */
  export(name) {
    const macro = this._macros.get(name);
    if (!macro) throw new Error(`[CtrlK] Macro not found: "${name}"`);
    return JSON.stringify(macro, null, 2);
  }

  /**
   * Import a macro from JSON.
   * @param {string|Object} data
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   * @returns {MacroDefinition}
   */
  import(data, options = {}) {
    const { overwrite = false } = options;
    const macro = typeof data === 'string' ? JSON.parse(data) : data;
    if (!macro.name || !macro.steps) throw new Error('[CtrlK] Invalid macro data');
    if (this._macros.has(macro.name) && !overwrite) {
      throw new Error(`[CtrlK] Macro "${macro.name}" already exists`);
    }
    macro.runCount = macro.runCount || 0;
    this._macros.set(macro.name, macro);
    this._registerMacroAsCommand(macro);
    this._persistToStorage();
    this._bus.emit('macro:imported', { name: macro.name });
    return macro;
  }

  /**
   * Get count of saved macros.
   * @returns {number}
   */
  count() {
    return this._macros.size;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Register built-in macro commands */
  _registerMacroCommands() {
    this._commands.register({
      id: 'ctrlk.macro.record',
      title: 'Record Macro',
      category: 'Macros',
      icon: '⏺',
      description: 'Start recording a macro',
      execute: () => {
        // In a real UI, this would open a prompt for the macro name
        this._bus.emit('macro:record-prompt', {});
      },
    });

    this._commands.register({
      id: 'ctrlk.macro.stop',
      title: 'Stop Recording',
      category: 'Macros',
      icon: '⏹',
      description: 'Stop recording the current macro',
      when: () => this._recording,
      execute: () => this.stop(),
    });

    this._commands.register({
      id: 'ctrlk.macro.list',
      title: 'View Macros',
      category: 'Macros',
      icon: '📋',
      description: 'List all saved macros',
      execute: () => this._bus.emit('macro:list-requested', { macros: this.list() }),
    });
  }

  /** @private Register a saved macro as an executable command */
  _registerMacroAsCommand(macro) {
    const cmdId = `macro.${this._slugify(macro.name)}`;
    this._commands.register({
      id: cmdId,
      title: `▶ ${macro.name}`,
      category: 'Macros',
      icon: '▶',
      description: macro.description || `${macro.steps.length} steps · Run ${macro.runCount} times`,
      shortcut: macro.shortcut || undefined,
      execute: () => this.play(macro.name, { instant: true }),
    });
  }

  /** @private Register all saved macros as commands */
  _registerSavedMacrosAsCommands() {
    for (const macro of this._macros.values()) {
      this._registerMacroAsCommand(macro);
    }
  }

  /** @private Resolve parameterized arguments */
  _resolveParams(args, params) {
    return args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('$')) {
        const paramName = arg.slice(1);
        return params[paramName] !== undefined ? params[paramName] : arg;
      }
      return arg;
    });
  }

  /** @private Promise-based delay */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** @private Create a URL-safe slug from a name */
  _slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  }

  /** @private */
  _persistToStorage() {
    try {
      const data = {};
      for (const [name, macro] of this._macros) {
        data[name] = macro;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [name, macro] of Object.entries(data)) {
          this._macros.set(name, macro);
        }
      }
    } catch (e) { /* silent */ }
  }
}
