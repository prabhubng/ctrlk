/**
 * CtrlK Session Tracker
 * ──────────────────────────────────────────────
 * Solves Problem #8: The Grid and Detail Page Don't Talk.
 * 
 * Tracks which records have been visited, reviewed, or edited
 * during the current work session. Provides:
 * 
 *   - Visited markers: which rows the user has clicked into
 *   - Reviewed markers: which rows the user explicitly marked as done
 *   - Dirty markers: which rows were edited in the detail page
 *   - Progress tracking: "12 of 30 reviewed"
 *   - Session persistence: survives page refresh within the session
 *   - Workflow sets: define a "review batch" and track progress through it
 * 
 * Excel parallel:
 *   - Track Changes (Review → Track Changes)
 *   - Cell highlighting for visited cells
 *   - Workbook sharing with change tracking
 * 
 * Usage:
 *   // When user opens a record from the grid
 *   ctrlk.session.markVisited('record-123');
 *   
 *   // When user completes review of a record
 *   ctrlk.session.markReviewed('record-123');
 *   
 *   // When user edits fields in the detail page
 *   ctrlk.session.markDirty('record-123', { fields: ['rating', 'status'] });
 *   
 *   // Check progress
 *   ctrlk.session.getProgress() → { visited: 7, reviewed: 5, dirty: 3, total: 30 }
 * 
 * @module @ctrlk/session
 * @author Neural Weaves Pvt Ltd
 */

const SESSION_KEY = 'ctrlk-session';

/**
 * @typedef {Object} RecordState
 * @property {string} id - Record/row ID
 * @property {boolean} visited - Has been opened/viewed
 * @property {boolean} reviewed - Explicitly marked as reviewed
 * @property {boolean} dirty - Has been edited
 * @property {string[]} dirtyFields - Which fields were edited
 * @property {number} visitedAt - When first visited
 * @property {number} [reviewedAt] - When marked reviewed
 * @property {number} [editedAt] - When last edited
 * @property {number} visitCount - How many times opened
 * @property {string} [notes] - Optional reviewer notes
 */

export class SessionTracker {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, RecordState>} Tracked records */
    this._records = new Map();

    /** @type {string|null} Current session ID */
    this._sessionId = null;

    /** @type {number} Session start time */
    this._startedAt = 0;

    /** @type {string|null} The defined "batch" — e.g., the current filter set's row IDs */
    this._batchIds = null;

    /** @type {string|null} Name for the current workflow */
    this._workflowName = null;
  }

  /**
   * Initialize or resume a session.
   * @param {Object} [options]
   * @param {string} [options.sessionId] - Resume a specific session
   * @param {boolean} [options.fresh=false] - Start fresh, discard previous
   */
  init(options = {}) {
    const { sessionId, fresh = false } = options;

    if (fresh) {
      this._records.clear();
      this._sessionId = this._generateId();
      this._startedAt = Date.now();
    } else if (sessionId) {
      this._sessionId = sessionId;
      this._loadSession();
    } else {
      // Try to resume last session
      this._loadSession();
      if (!this._sessionId) {
        this._sessionId = this._generateId();
        this._startedAt = Date.now();
      }
    }

    this._bus.emit('session:started', { sessionId: this._sessionId, recordCount: this._records.size });
  }

  // ═══════════════════════════════════════════
  // MARK — Record state transitions
  // ═══════════════════════════════════════════

  /**
   * Mark a record as visited (user opened it from the grid).
   * @param {string} id - Record/row ID
   */
  markVisited(id) {
    const record = this._getOrCreate(id);
    record.visited = true;
    record.visitCount++;
    if (!record.visitedAt) record.visitedAt = Date.now();
    this._persist();
    this._bus.emit('session:visited', { id, visitCount: record.visitCount });
  }

  /**
   * Mark a record as reviewed (user explicitly completed review).
   * @param {string} id
   * @param {Object} [options]
   * @param {string} [options.notes] - Optional reviewer notes
   */
  markReviewed(id, options = {}) {
    const record = this._getOrCreate(id);
    record.reviewed = true;
    record.reviewedAt = Date.now();
    if (options.notes) record.notes = options.notes;

    // Also mark as visited if not already
    if (!record.visited) {
      record.visited = true;
      record.visitCount++;
      record.visitedAt = Date.now();
    }

    this._persist();
    this._bus.emit('session:reviewed', { id, progress: this.getProgress() });
  }

  /**
   * Unmark a record as reviewed (undo review).
   * @param {string} id
   */
  unmarkReviewed(id) {
    const record = this._records.get(id);
    if (record) {
      record.reviewed = false;
      record.reviewedAt = null;
      this._persist();
      this._bus.emit('session:unreviewed', { id, progress: this.getProgress() });
    }
  }

  /**
   * Mark a record as dirty (user edited fields on the detail page).
   * @param {string} id
   * @param {Object} [options]
   * @param {string[]} [options.fields] - Which fields were edited
   */
  markDirty(id, options = {}) {
    const record = this._getOrCreate(id);
    record.dirty = true;
    record.editedAt = Date.now();

    if (options.fields) {
      const fieldSet = new Set(record.dirtyFields);
      for (const f of options.fields) fieldSet.add(f);
      record.dirtyFields = Array.from(fieldSet);
    }

    this._persist();
    this._bus.emit('session:dirty', { id, fields: record.dirtyFields });
  }

  /**
   * Clear dirty state for a record (after save).
   * @param {string} id
   */
  clearDirty(id) {
    const record = this._records.get(id);
    if (record) {
      record.dirty = false;
      record.dirtyFields = [];
      this._persist();
      this._bus.emit('session:dirty-cleared', { id });
    }
  }

  // ═══════════════════════════════════════════
  // QUERY — Check record states
  // ═══════════════════════════════════════════

  /**
   * Check if a record has been visited.
   * @param {string} id
   * @returns {boolean}
   */
  isVisited(id) {
    return this._records.get(id)?.visited || false;
  }

  /**
   * Check if a record has been reviewed.
   * @param {string} id
   * @returns {boolean}
   */
  isReviewed(id) {
    return this._records.get(id)?.reviewed || false;
  }

  /**
   * Check if a record is dirty (edited but possibly not saved).
   * @param {string} id
   * @returns {boolean}
   */
  isDirty(id) {
    return this._records.get(id)?.dirty || false;
  }

  /**
   * Get the full state of a record.
   * @param {string} id
   * @returns {RecordState|null}
   */
  getState(id) {
    return this._records.get(id) || null;
  }

  /**
   * Get all records with a specific state.
   * @param {'visited'|'reviewed'|'dirty'|'unreviewed'|'unvisited'} state
   * @returns {RecordState[]}
   */
  getByState(state) {
    const records = Array.from(this._records.values());
    switch (state) {
      case 'visited': return records.filter(r => r.visited);
      case 'reviewed': return records.filter(r => r.reviewed);
      case 'dirty': return records.filter(r => r.dirty);
      case 'unreviewed': return records.filter(r => r.visited && !r.reviewed);
      default: return records;
    }
  }

  /**
   * Get IDs of all visited records (for grid highlighting).
   * @returns {string[]}
   */
  getVisitedIds() {
    return Array.from(this._records.values()).filter(r => r.visited).map(r => r.id);
  }

  /**
   * Get IDs of all reviewed records.
   * @returns {string[]}
   */
  getReviewedIds() {
    return Array.from(this._records.values()).filter(r => r.reviewed).map(r => r.id);
  }

  /**
   * Get IDs of all dirty records.
   * @returns {string[]}
   */
  getDirtyIds() {
    return Array.from(this._records.values()).filter(r => r.dirty).map(r => r.id);
  }

  // ═══════════════════════════════════════════
  // PROGRESS — Batch review tracking
  // ═══════════════════════════════════════════

  /**
   * Define a batch — the set of records to review.
   * Typically set from the current grid filter result.
   * 
   * @param {string[]} ids - All record IDs in the batch
   * @param {string} [name] - Workflow name (e.g., "Q4 Compliance Review")
   */
  setBatch(ids, name) {
    this._batchIds = [...ids];
    this._workflowName = name || null;
    this._bus.emit('session:batch-set', { total: ids.length, name });
  }

  /**
   * Get progress through the current batch.
   * @returns {{visited: number, reviewed: number, dirty: number, total: number, percent: number, name: string|null}}
   */
  getProgress() {
    const batchIds = this._batchIds || Array.from(this._records.keys());
    const total = batchIds.length;
    let visited = 0, reviewed = 0, dirty = 0;

    for (const id of batchIds) {
      const record = this._records.get(id);
      if (record) {
        if (record.visited) visited++;
        if (record.reviewed) reviewed++;
        if (record.dirty) dirty++;
      }
    }

    return {
      visited,
      reviewed,
      dirty,
      total,
      percent: total > 0 ? Math.round((reviewed / total) * 100) : 0,
      name: this._workflowName,
    };
  }

  /**
   * Get the next unreviewed record ID in the batch.
   * @returns {string|null}
   */
  getNextUnreviewed() {
    const batchIds = this._batchIds || [];
    for (const id of batchIds) {
      const record = this._records.get(id);
      if (!record || !record.reviewed) return id;
    }
    return null;
  }

  /**
   * Get the next unvisited record ID in the batch.
   * @returns {string|null}
   */
  getNextUnvisited() {
    const batchIds = this._batchIds || [];
    for (const id of batchIds) {
      const record = this._records.get(id);
      if (!record || !record.visited) return id;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════

  /**
   * Get session info.
   * @returns {{sessionId: string, startedAt: number, recordCount: number, workflowName: string|null}}
   */
  getSessionInfo() {
    return {
      sessionId: this._sessionId,
      startedAt: this._startedAt,
      recordCount: this._records.size,
      workflowName: this._workflowName,
    };
  }

  /**
   * End the current session and optionally start a new one.
   * @param {Object} [options]
   * @param {boolean} [options.persist=true] - Save session data for potential resume
   */
  end(options = {}) {
    const { persist = true } = options;
    const summary = this.getProgress();

    if (!persist) {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* silent */ }
    }

    this._bus.emit('session:ended', {
      sessionId: this._sessionId,
      summary,
      duration: Date.now() - this._startedAt,
    });

    this._records.clear();
    this._batchIds = null;
    this._workflowName = null;
    this._sessionId = null;
  }

  /**
   * Reset all tracking data for the current session.
   */
  reset() {
    this._records.clear();
    this._persist();
    this._bus.emit('session:reset', {});
  }

  /**
   * Export session data as JSON (for reporting).
   * @returns {string}
   */
  export() {
    return JSON.stringify({
      sessionId: this._sessionId,
      startedAt: this._startedAt,
      workflowName: this._workflowName,
      batchIds: this._batchIds,
      records: Object.fromEntries(this._records),
      progress: this.getProgress(),
      exportedAt: Date.now(),
    }, null, 2);
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Get or create a record state */
  _getOrCreate(id) {
    if (!this._records.has(id)) {
      this._records.set(id, {
        id,
        visited: false,
        reviewed: false,
        dirty: false,
        dirtyFields: [],
        visitedAt: null,
        reviewedAt: null,
        editedAt: null,
        visitCount: 0,
        notes: null,
      });
    }
    return this._records.get(id);
  }

  /** @private */
  _generateId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** @private */
  _persist() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionId: this._sessionId,
        startedAt: this._startedAt,
        workflowName: this._workflowName,
        batchIds: this._batchIds,
        records: Object.fromEntries(this._records),
      }));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this._sessionId = data.sessionId;
        this._startedAt = data.startedAt || Date.now();
        this._workflowName = data.workflowName || null;
        this._batchIds = data.batchIds || null;
        if (data.records) {
          for (const [id, record] of Object.entries(data.records)) {
            this._records.set(id, record);
          }
        }
      }
    } catch (e) { /* silent */ }
  }
}
