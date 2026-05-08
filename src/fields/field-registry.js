/**
 * CtrlK Field Registry
 * ──────────────────────────────────────────────
 * Every labeled field on a detail/form page registers itself.
 * 
 * This is the data layer that enables:
 *   - Jump-to-Field (Ctrl+G / F5 — Excel's Go To)
 *   - Empty Field Navigator (Alt+N / Alt+Shift+N)
 *   - Dirty Field Tracking (which fields changed?)
 *   - Field Pinning (cross-record sticky fields)
 *   - Tab-through editing within sections
 * 
 * Fields can be registered:
 *   1. Declaratively: data-ctrlk-field="issuerName" on DOM elements
 *   2. Programmatically: ctrlk.fields.register({ ... })
 *   3. Via framework adapters: @CtrlkField() decorator, useCtrlkField() hook
 * 
 * Excel parallel:
 *   - F5 / Ctrl+G = Go To (our jump-to-field)
 *   - Ctrl+Home = first field
 *   - Ctrl+End = last field
 *   - Tab = next editable field in section
 *   - Enter = commit edit, move to next field
 * 
 * @module @ctrlk/fields
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} FieldDefinition
 * @property {string} id - Unique field identifier (e.g., 'ratings.moodys.corp_family')
 * @property {string} label - Human-readable label (e.g., "Moody's Corp Family Rating")
 * @property {string} section - Section this field belongs to (e.g., 'Ratings')
 * @property {string|Element} element - CSS selector or DOM element
 * @property {boolean} editable - Can this field be edited?
 * @property {boolean} required - Is this field required?
 * @property {*} [value] - Current value (if trackable)
 * @property {*} [originalValue] - Value before edits (for dirty tracking)
 * @property {Function} [getValue] - Custom value getter
 * @property {Function} [setValue] - Custom value setter
 * @property {Function} [startEdit] - Custom edit mode trigger
 * @property {Function} [stopEdit] - Custom edit mode exit
 * @property {string} [group] - Sub-group within section (e.g., 'Issuer Info')
 * @property {number} [order] - Sort order within section
 * @property {string[]} [tags] - Searchable tags
 */

const PINS_STORAGE_KEY = 'ctrlk-field-pins';

export class FieldRegistry {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, FieldDefinition>} */
    this._fields = new Map();

    /** @type {string[]} Ordered list of field IDs (registration order, overridable) */
    this._order = [];

    /** @type {Set<string>} Pinned field IDs (persist across records) */
    this._pinned = new Set();

    /** @type {Map<string, *>} Original values for dirty tracking */
    this._originals = new Map();

    /** @type {string|null} Currently focused field */
    this._focused = null;

    /** @type {boolean} Edit mode active */
    this._editing = false;

    /** @type {string[]} Configurable section display order */
    this._sectionOrder = [];
  }

  /**
   * Initialize — load pinned fields, auto-discover DOM fields.
   */
  init() {
    this._loadPins();
  }

  // ═══════════════════════════════════════════
  // REGISTER — Fields declare themselves
  // ═══════════════════════════════════════════

  /**
   * Register a field.
   * @param {FieldDefinition} def
   * @returns {Function} Unregister function
   */
  register(def) {
    if (!def.id) throw new Error('[CtrlK] Field must have an id');

    const field = {
      id: def.id,
      label: def.label || def.id,
      section: def.section || 'General',
      group: def.group || null,
      element: def.element || null,
      editable: def.editable !== false,
      required: def.required || false,
      value: def.value !== undefined ? def.value : undefined,
      originalValue: def.value !== undefined ? def.value : undefined,
      getValue: def.getValue || null,
      setValue: def.setValue || null,
      startEdit: def.startEdit || null,
      stopEdit: def.stopEdit || null,
      order: def.order ?? this._order.length,
      tags: def.tags || [],
      _dirty: false,
      _empty: this._isEmpty(def.value),
    };

    this._fields.set(def.id, field);
    this._originals.set(def.id, field.originalValue);

    // Maintain order
    if (!this._order.includes(def.id)) {
      this._order.push(def.id);
      this._order.sort((a, b) => {
        const fa = this._fields.get(a);
        const fb = this._fields.get(b);
        return (fa?.order ?? 0) - (fb?.order ?? 0);
      });
    }

    this._bus.emit('field:registered', { id: def.id, label: field.label, section: field.section });

    return () => this.unregister(def.id);
  }

  /**
   * Register multiple fields.
   * @param {FieldDefinition[]} defs
   * @returns {Function} Unregister all
   */
  registerMany(defs) {
    const fns = defs.map(d => this.register(d));
    return () => fns.forEach(fn => fn());
  }

  /**
   * Unregister a field.
   * @param {string} id
   */
  unregister(id) {
    this._fields.delete(id);
    this._originals.delete(id);
    this._order = this._order.filter(i => i !== id);
    this._bus.emit('field:unregistered', { id });
  }

  /**
   * Auto-discover fields from DOM elements with data-ctrlk-field.
   * 
   * Expected attributes:
   *   data-ctrlk-field="fieldId"
   *   data-ctrlk-label="Display Name"
   *   data-ctrlk-section="Section Name"
   *   data-ctrlk-group="Group Name"
   *   data-ctrlk-editable="true|false"
   *   data-ctrlk-required="true|false"
   */
  discover() {
    const elements = document.querySelectorAll('[data-ctrlk-field]');
    for (const el of elements) {
      const id = el.getAttribute('data-ctrlk-field');
      if (this._fields.has(id)) continue;

      this.register({
        id,
        label: el.getAttribute('data-ctrlk-label') || el.textContent?.trim() || id,
        section: el.getAttribute('data-ctrlk-section') || this._inferSection(el),
        group: el.getAttribute('data-ctrlk-group') || null,
        element: el,
        editable: el.getAttribute('data-ctrlk-editable') !== 'false',
        required: el.getAttribute('data-ctrlk-required') === 'true',
        value: this._readDomValue(el),
      });
    }
  }

  // ═══════════════════════════════════════════
  // QUERY — Find fields
  // ═══════════════════════════════════════════

  /**
   * Get a field by ID.
   * @param {string} id
   * @returns {FieldDefinition|undefined}
   */
  get(id) {
    return this._fields.get(id);
  }

  /**
   * Get all registered fields in order.
   * @returns {FieldDefinition[]}
   */
  getAll() {
    return this._order.map(id => this._fields.get(id)).filter(Boolean);
  }

  /**
   * Get fields grouped by section.
   * Respects configured section order (via setSectionOrder).
   * @returns {Map<string, FieldDefinition[]>}
   */
  getGrouped() {
    const groups = new Map();
    for (const id of this._order) {
      const field = this._fields.get(id);
      if (!field) continue;
      if (!groups.has(field.section)) groups.set(field.section, []);
      groups.get(field.section).push(field);
    }

    // Re-order by configured section order
    if (this._sectionOrder.length > 0) {
      const ordered = new Map();
      for (const sec of this._sectionOrder) {
        if (groups.has(sec)) ordered.set(sec, groups.get(sec));
      }
      // Append any sections not in the configured order
      for (const [sec, fields] of groups) {
        if (!ordered.has(sec)) ordered.set(sec, fields);
      }
      return ordered;
    }

    return groups;
  }

  /**
   * Get all registered fields in order. Alias for getAll().
   * @returns {FieldDefinition[]}
   */
  list() {
    return this.getAll();
  }

  /**
   * Set the display order for sections.
   * Sections not in this list appear after ordered sections, sorted alphabetically.
   * @param {string[]} sections - Section names in desired display order
   */
  setSectionOrder(sections) {
    this._sectionOrder = [...sections];
    this._bus.emit('field:section-order-changed', { sections: this._sectionOrder });
  }

  /**
   * Get the configured section order.
   * @returns {string[]}
   */
  getSectionOrder() {
    return [...this._sectionOrder];
  }

  /**
   * Search fields and return results pre-grouped by section.
   * Respects configured section order. Each section's fields are sorted by score.
   * @param {string} query
   * @param {Object} [options]
   * @param {number} [options.limit=100]
   * @param {boolean} [options.editableOnly=false]
   * @returns {{ sections: Array<{ name: string, fields: Array<{field: FieldDefinition, score: number}> }>, total: number }}
   */
  searchGrouped(query, options = {}) {
    const { limit = 100, editableOnly = false } = options;
    const results = this.search(query, { limit, editableOnly });

    // Group by section
    const bySection = new Map();
    for (const r of results) {
      const sec = r.field.section || 'Other';
      if (!bySection.has(sec)) bySection.set(sec, []);
      bySection.get(sec).push(r);
    }

    // Order sections
    const sectionNames = this._sectionOrder.length > 0
      ? [...this._sectionOrder.filter(s => bySection.has(s)), ...Array.from(bySection.keys()).filter(s => !this._sectionOrder.includes(s)).sort()]
      : Array.from(bySection.keys());

    const sections = sectionNames.map(name => ({
      name,
      fields: bySection.get(name) || [],
    })).filter(s => s.fields.length > 0);

    return { sections, total: results.length };
  }

  /**
   * Search fields by query (for Jump-to-Field / F5).
   * Matches against label, id, section, group, and tags.
   * @param {string} query
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=false]
   * @param {boolean} [options.emptyOnly=false]
   * @param {number} [options.limit=20]
   * @returns {Array<{field: FieldDefinition, score: number}>}
   */
  search(query, options = {}) {
    const { editableOnly = false, emptyOnly = false, limit = 20 } = options;
    const q = query.toLowerCase().trim();

    let fields = this.getAll();
    if (editableOnly) fields = fields.filter(f => f.editable);
    if (emptyOnly) fields = fields.filter(f => f._empty);

    if (!q) {
      return fields.slice(0, limit).map(f => ({ field: f, score: 0 }));
    }

    const results = [];
    for (const field of fields) {
      let score = 0;
      const label = field.label.toLowerCase();
      const id = field.id.toLowerCase();
      const section = field.section.toLowerCase();
      const tags = field.tags.map(t => t.toLowerCase());

      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 50;
      else if (label.includes(q)) score = 30;
      else if (id.includes(q)) score = 20;
      else if (section.includes(q)) score = 15;
      else if (tags.some(t => t.includes(q))) score = 10;
      else {
        // Fuzzy match on label
        let qi = 0;
        for (let i = 0; i < label.length && qi < q.length; i++) {
          if (label[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 5;
      }

      if (score > 0) results.push({ field, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get count of registered fields.
   * @returns {number}
   */
  count() {
    return this._fields.size;
  }

  // ═══════════════════════════════════════════
  // NAVIGATE — Move between fields
  // ═══════════════════════════════════════════

  /**
   * Focus a field — scroll to it, highlight it.
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.edit=false] - Enter edit mode immediately
   * @returns {boolean}
   */
  focus(id, options = {}) {
    const { edit = false } = options;
    const field = this._fields.get(id);
    if (!field) return false;

    this._focused = id;

    // Scroll element into view
    const el = this._resolveElement(field);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add focus highlight
      el.classList.add('ctrlk-field-focused');
      setTimeout(() => el.classList.remove('ctrlk-field-focused'), 2000);

      // Enter edit mode if requested
      if (edit && field.editable) {
        this.startEdit(id);
      }
    }

    this._bus.emit('field:focused', { id, label: field.label, section: field.section });
    return true;
  }

  /**
   * Focus the next field (Tab behavior).
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=true] - Skip non-editable fields
   * @param {boolean} [options.withinSection=true] - Stay within current section
   * @returns {string|null} ID of the newly focused field
   */
  focusNext(options = {}) {
    const { editableOnly = true, withinSection = true } = options;
    return this._moveFocus(1, editableOnly, withinSection);
  }

  /**
   * Focus the previous field (Shift+Tab behavior).
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=true]
   * @param {boolean} [options.withinSection=true]
   * @returns {string|null}
   */
  focusPrev(options = {}) {
    const { editableOnly = true, withinSection = true } = options;
    return this._moveFocus(-1, editableOnly, withinSection);
  }

  /**
   * Focus the next empty field (Alt+N).
   * @returns {string|null}
   */
  focusNextEmpty() {
    this._refreshEmptyStates();
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : -1;

    for (let i = currentIdx + 1; i < this._order.length; i++) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    // Wrap around
    for (let i = 0; i <= currentIdx; i++) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    return null;
  }

  /**
   * Focus the previous empty field (Alt+Shift+N).
   * @returns {string|null}
   */
  focusPrevEmpty() {
    this._refreshEmptyStates();
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : this._order.length;

    for (let i = currentIdx - 1; i >= 0; i--) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    return null;
  }

  /**
   * Focus the first field (Ctrl+Home).
   * @returns {string|null}
   */
  focusFirst() {
    if (this._order.length === 0) return null;
    this.focus(this._order[0]);
    return this._order[0];
  }

  /**
   * Focus the last field (Ctrl+End).
   * @returns {string|null}
   */
  focusLast() {
    if (this._order.length === 0) return null;
    const lastId = this._order[this._order.length - 1];
    this.focus(lastId);
    return lastId;
  }

  /**
   * Get the currently focused field ID.
   * @returns {string|null}
   */
  getFocused() {
    return this._focused;
  }

  // ═══════════════════════════════════════════
  // EDIT — Inline editing lifecycle
  // ═══════════════════════════════════════════

  /**
   * Start editing a field (F2 behavior).
   * @param {string} id
   * @returns {boolean}
   */
  startEdit(id) {
    const field = this._fields.get(id);
    if (!field || !field.editable) return false;

    this._editing = true;
    this._focused = id;

    if (field.startEdit) {
      field.startEdit();
    } else {
      const el = this._resolveElement(field);
      if (el) {
        // Find the nearest input/textarea/select
        const input = el.querySelector('input, textarea, select') || el;
        if (input.focus) input.focus();
        if (input.select) input.select();
      }
    }

    this._bus.emit('field:edit-started', { id, label: field.label });
    return true;
  }

  /**
   * Stop editing (Enter = commit, Escape = cancel).
   * @param {boolean} [cancel=false]
   * @returns {boolean}
   */
  stopEdit(cancel = false) {
    if (!this._editing || !this._focused) return false;

    const field = this._fields.get(this._focused);
    if (!field) return false;

    if (cancel) {
      // Revert to original value
      if (field.setValue && this._originals.has(this._focused)) {
        field.setValue(this._originals.get(this._focused));
        field._dirty = false;
      }
    } else {
      // Commit — read current value and check if dirty
      const currentValue = this._readFieldValue(field);
      const originalValue = this._originals.get(this._focused);
      field._dirty = currentValue !== originalValue;
      field.value = currentValue;
      field._empty = this._isEmpty(currentValue);
    }

    if (field.stopEdit) {
      field.stopEdit(cancel);
    }

    this._editing = false;
    this._bus.emit('field:edit-stopped', {
      id: this._focused,
      cancel,
      dirty: field._dirty,
    });

    return true;
  }

  /**
   * Commit current edit and move to next field (Enter behavior).
   * @returns {string|null} Next field ID
   */
  commitAndNext() {
    this.stopEdit(false);
    return this.focusNext();
  }

  // ═══════════════════════════════════════════
  // DIRTY TRACKING — What changed?
  // ═══════════════════════════════════════════

  /**
   * Get all dirty (modified) fields.
   * @returns {Array<{id: string, label: string, section: string, oldValue: *, newValue: *}>}
   */
  getDirty() {
    const dirty = [];
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        dirty.push({
          id,
          label: field.label,
          section: field.section,
          oldValue: this._originals.get(id),
          newValue: this._readFieldValue(field),
        });
      }
    }
    return dirty;
  }

  /**
   * Get count of dirty fields.
   * @returns {number}
   */
  getDirtyCount() {
    let count = 0;
    for (const field of this._fields.values()) {
      if (field._dirty) count++;
    }
    return count;
  }

  /**
   * Check if any fields are dirty.
   * @returns {boolean}
   */
  isDirty() {
    for (const field of this._fields.values()) {
      if (field._dirty) return true;
    }
    return false;
  }

  /**
   * Mark a specific field as dirty (for external change tracking).
   * @param {string} id
   * @param {*} newValue
   */
  markDirty(id, newValue) {
    const field = this._fields.get(id);
    if (!field) return;
    field._dirty = true;
    field.value = newValue;
    field._empty = this._isEmpty(newValue);
    this._bus.emit('field:dirty', { id, label: field.label, newValue });
  }

  /**
   * Revert a single field to its original value.
   * @param {string} id
   * @returns {boolean}
   */
  revert(id) {
    const field = this._fields.get(id);
    if (!field) return false;
    const original = this._originals.get(id);
    if (field.setValue) field.setValue(original);
    field.value = original;
    field._dirty = false;
    field._empty = this._isEmpty(original);
    this._bus.emit('field:reverted', { id, value: original });
    return true;
  }

  /**
   * Revert all dirty fields.
   */
  revertAll() {
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        this.revert(id);
      }
    }
  }

  /**
   * Accept all dirty fields as the new baseline
   * (call after successful save).
   */
  acceptAll() {
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        const currentValue = this._readFieldValue(field);
        this._originals.set(id, currentValue);
        field.originalValue = currentValue;
        field._dirty = false;
      }
    }
    this._bus.emit('field:all-accepted', {});
  }

  // ═══════════════════════════════════════════
  // EMPTY FIELDS — Completeness tracking
  // ═══════════════════════════════════════════

  /**
   * Get all empty fields.
   * @returns {FieldDefinition[]}
   */
  getEmpty() {
    this._refreshEmptyStates();
    return this.getAll().filter(f => f._empty);
  }

  /**
   * Get empty field count.
   * @returns {number}
   */
  getEmptyCount() {
    this._refreshEmptyStates();
    return this.getAll().filter(f => f._empty).length;
  }

  /**
   * Get completeness stats.
   * @returns {{total: number, filled: number, empty: number, required: number, requiredEmpty: number, percent: number}}
   */
  getCompleteness() {
    this._refreshEmptyStates();
    const all = this.getAll();
    const empty = all.filter(f => f._empty);
    const required = all.filter(f => f.required);
    const requiredEmpty = required.filter(f => f._empty);
    return {
      total: all.length,
      filled: all.length - empty.length,
      empty: empty.length,
      required: required.length,
      requiredEmpty: requiredEmpty.length,
      percent: all.length > 0 ? Math.round(((all.length - empty.length) / all.length) * 100) : 100,
    };
  }

  // ═══════════════════════════════════════════
  // PINNING — Sticky fields across records
  // ═══════════════════════════════════════════

  /**
   * Pin a field (persist across record navigation).
   * @param {string} id
   */
  pin(id) {
    this._pinned.add(id);
    this._persistPins();
    this._bus.emit('field:pinned', { id });
  }

  /**
   * Unpin a field.
   * @param {string} id
   */
  unpin(id) {
    this._pinned.delete(id);
    this._persistPins();
    this._bus.emit('field:unpinned', { id });
  }

  /**
   * Toggle pin state.
   * @param {string} id
   */
  togglePin(id) {
    this._pinned.has(id) ? this.unpin(id) : this.pin(id);
  }

  /**
   * Check if a field is pinned.
   * @param {string} id
   * @returns {boolean}
   */
  isPinned(id) {
    return this._pinned.has(id);
  }

  /**
   * Get all pinned fields.
   * @returns {FieldDefinition[]}
   */
  getPinned() {
    return Array.from(this._pinned)
      .map(id => this._fields.get(id))
      .filter(Boolean);
  }

  /**
   * Get pinned field values (for cross-record display).
   * @returns {Array<{id: string, label: string, section: string, value: *}>}
   */
  getPinnedValues() {
    return Array.from(this._pinned).map(id => {
      const field = this._fields.get(id);
      if (!field) return null;
      return {
        id,
        label: field.label,
        section: field.section,
        value: this._readFieldValue(field),
      };
    }).filter(Boolean);
  }

  // ═══════════════════════════════════════════
  // CLEAR
  // ═══════════════════════════════════════════

  /**
   * Clear all registered fields (on page change).
   * Pinned fields persist.
   */
  clear() {
    this._fields.clear();
    this._originals.clear();
    this._order = [];
    this._focused = null;
    this._editing = false;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _moveFocus(direction, editableOnly, withinSection) {
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : -1;
    const currentField = this._focused ? this._fields.get(this._focused) : null;
    const currentSection = currentField?.section;

    let candidates = this._order.map(id => this._fields.get(id)).filter(Boolean);
    if (editableOnly) candidates = candidates.filter(f => f.editable);
    if (withinSection && currentSection) candidates = candidates.filter(f => f.section === currentSection);

    const candidateIds = candidates.map(f => f.id);
    const currentCandidateIdx = this._focused ? candidateIds.indexOf(this._focused) : -1;

    let nextIdx;
    if (direction > 0) {
      nextIdx = currentCandidateIdx + 1;
      if (nextIdx >= candidateIds.length) nextIdx = 0;
    } else {
      nextIdx = currentCandidateIdx - 1;
      if (nextIdx < 0) nextIdx = candidateIds.length - 1;
    }

    if (candidateIds[nextIdx]) {
      this.focus(candidateIds[nextIdx]);
      return candidateIds[nextIdx];
    }
    return null;
  }

  /** @private */
  _resolveElement(field) {
    if (!field.element) return null;
    if (typeof field.element === 'string') {
      return document.querySelector(field.element);
    }
    return field.element;
  }

  /** @private */
  _readFieldValue(field) {
    if (field.getValue) return field.getValue();
    const el = this._resolveElement(field);
    if (el) return this._readDomValue(el);
    return field.value;
  }

  /** @private */
  _readDomValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      return el.value;
    }
    return el.textContent?.trim() || null;
  }

  /** @private */
  _isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'not set')) return true;
    return false;
  }

  /** @private */
  _refreshEmptyStates() {
    for (const [id, field] of this._fields) {
      const val = this._readFieldValue(field);
      field._empty = this._isEmpty(val);
    }
  }

  /** @private */
  _inferSection(el) {
    let current = el.parentElement;
    while (current && current !== document.body) {
      const sectionAttr = current.getAttribute('data-ctrlk-section');
      if (sectionAttr) return sectionAttr;

      // Look for common section header patterns
      const header = current.querySelector('h2, h3, .section-title, .fg-title');
      if (header) return header.textContent.trim();

      current = current.parentElement;
    }
    return 'General';
  }

  /** @private */
  _persistPins() {
    try {
      localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(Array.from(this._pinned)));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadPins() {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      if (raw) {
        const pins = JSON.parse(raw);
        for (const id of pins) this._pinned.add(id);
      }
    } catch (e) { /* silent */ }
  }
}
