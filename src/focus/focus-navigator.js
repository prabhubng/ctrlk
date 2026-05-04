/**
 * CtrlK Focus Navigator
 * ──────────────────────────────────────────────
 * Spatial keyboard navigation between UI zones.
 * 
 * A "zone" is a logical region of the UI: the sidebar,
 * the main grid, a filter panel, a detail card.
 * 
 * Tab moves focus between zones (not between individual elements).
 * Arrow keys navigate within the active zone.
 * Typing starts filtering without clicking into an input first
 * (focus-follows-intent).
 * 
 * Zones are declared on DOM elements:
 *   <nav data-ctrlk-zone="sidebar" data-ctrlk-zone-order="1">
 *   <main data-ctrlk-zone="grid" data-ctrlk-zone-order="2">
 *   <aside data-ctrlk-zone="detail" data-ctrlk-zone-order="3">
 * 
 * Or programmatically:
 *   ctrlk.focus.registerZone('grid', { element: '#main-grid', order: 2 });
 * 
 * Excel parallel:
 *   - Ctrl+Page Down/Up = switch between sheets (our switch between zones)
 *   - F6 = cycle between panes (our zone cycling)
 *   - Arrow keys within active sheet (our within-zone navigation)
 * 
 * @module @ctrlk/focus
 * @author Neural Weaves Pvt Ltd
 */

/**
 * @typedef {Object} ZoneDefinition
 * @property {string} id - Unique zone identifier
 * @property {string|Element} element - CSS selector or DOM element
 * @property {number} order - Tab order (lower = first)
 * @property {string} [label] - Human-readable label for accessibility
 * @property {Function} [onEnter] - Called when zone receives focus
 * @property {Function} [onLeave] - Called when zone loses focus
 * @property {string} [entryTarget] - CSS selector for the element that should
 *   receive focus when the zone is entered (e.g., first row of a grid)
 * @property {boolean} [trapFocus=false] - When true, Tab/Shift+Tab cycle within
 *   the zone instead of leaving (useful for modals)
 */

export class FocusNavigator {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, ZoneDefinition>} */
    this._zones = new Map();

    /** @type {string|null} Currently active zone */
    this._activeZone = null;

    /** @type {boolean} Focus navigation enabled */
    this._enabled = true;

    /** @type {boolean} Attached to DOM */
    this._attached = false;

    /** @type {Map<string, Element|null>} Cached resolved elements */
    this._elements = new Map();

    /** Bound handlers for cleanup */
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleFocusIn = this._handleFocusIn.bind(this);
  }

  // ═══════════════════════════════════════════
  // ZONE REGISTRATION
  // ═══════════════════════════════════════════

  /**
   * Register a focus zone.
   * @param {string} id - Unique zone ID
   * @param {Object} options
   * @param {string|Element} options.element - CSS selector or DOM element
   * @param {number} [options.order=0] - Tab order
   * @param {string} [options.label] - Accessibility label
   * @param {Function} [options.onEnter] - Callback on zone entry
   * @param {Function} [options.onLeave] - Callback on zone exit
   * @param {string} [options.entryTarget] - CSS selector for initial focus target
   * @param {boolean} [options.trapFocus=false] - Trap focus within zone
   * @returns {Function} Unregister function
   */
  registerZone(id, options) {
    const zone = {
      id,
      element: options.element,
      order: options.order ?? this._zones.size,
      label: options.label || id,
      onEnter: options.onEnter || null,
      onLeave: options.onLeave || null,
      entryTarget: options.entryTarget || null,
      trapFocus: options.trapFocus || false,
    };

    this._zones.set(id, zone);
    this._elements.delete(id); // Clear cached element

    this._bus.emit('focus:zone-registered', { id, label: zone.label, order: zone.order });

    return () => {
      this._zones.delete(id);
      this._elements.delete(id);
      if (this._activeZone === id) this._activeZone = null;
    };
  }

  /**
   * Auto-discover zones from DOM elements with data-ctrlk-zone.
   */
  discover() {
    const elements = document.querySelectorAll('[data-ctrlk-zone]');
    for (const el of elements) {
      const id = el.getAttribute('data-ctrlk-zone');
      if (this._zones.has(id)) continue;

      this.registerZone(id, {
        element: el,
        order: parseInt(el.getAttribute('data-ctrlk-zone-order') || '0', 10),
        label: el.getAttribute('data-ctrlk-zone-label') || el.getAttribute('aria-label') || id,
        entryTarget: el.getAttribute('data-ctrlk-zone-entry') || null,
        trapFocus: el.getAttribute('data-ctrlk-zone-trap') === 'true',
      });
    }
  }

  // ═══════════════════════════════════════════
  // ATTACH / DETACH — DOM event listeners
  // ═══════════════════════════════════════════

  /**
   * Start listening for focus navigation keys.
   */
  attach() {
    if (this._attached) return;
    document.addEventListener('keydown', this._handleKeyDown, true);
    document.addEventListener('focusin', this._handleFocusIn, true);
    this._attached = true;
  }

  /**
   * Stop listening.
   */
  detach() {
    if (!this._attached) return;
    document.removeEventListener('keydown', this._handleKeyDown, true);
    document.removeEventListener('focusin', this._handleFocusIn, true);
    this._attached = false;
  }

  // ═══════════════════════════════════════════
  // NAVIGATION — Move between zones
  // ═══════════════════════════════════════════

  /**
   * Move focus to a specific zone.
   * @param {string} zoneId
   * @returns {boolean}
   */
  moveTo(zoneId) {
    const zone = this._zones.get(zoneId);
    if (!zone) return false;

    const prevZone = this._activeZone;

    // Call onLeave for previous zone
    if (prevZone) {
      const prevDef = this._zones.get(prevZone);
      if (prevDef?.onLeave) {
        try { prevDef.onLeave(); } catch (e) { /* silent */ }
      }
    }

    this._activeZone = zoneId;

    // Resolve the DOM element
    const el = this._resolveElement(zone);
    if (el) {
      // Find the entry target within the zone
      let target = null;
      if (zone.entryTarget) {
        target = el.querySelector(zone.entryTarget);
      }
      if (!target) {
        // Find the first focusable element
        target = this._findFirstFocusable(el);
      }
      if (target) {
        target.focus();
      } else {
        // If no focusable element, focus the zone itself
        if (!el.getAttribute('tabindex')) {
          el.setAttribute('tabindex', '-1');
        }
        el.focus();
      }

      // Add visual indicator
      this._clearZoneHighlights();
      el.classList.add('ctrlk-zone-active');
    }

    // Call onEnter for new zone
    if (zone.onEnter) {
      try { zone.onEnter(); } catch (e) { /* silent */ }
    }

    this._bus.emit('focus:zone-changed', {
      from: prevZone,
      to: zoneId,
      label: zone.label,
    });

    return true;
  }

  /**
   * Move to the next zone (F6 or custom key).
   * @returns {string|null} Zone ID moved to
   */
  nextZone() {
    const ordered = this._getOrderedZones();
    if (ordered.length === 0) return null;

    const currentIdx = this._activeZone ? ordered.findIndex(z => z.id === this._activeZone) : -1;
    const nextIdx = (currentIdx + 1) % ordered.length;
    const zone = ordered[nextIdx];

    this.moveTo(zone.id);
    return zone.id;
  }

  /**
   * Move to the previous zone (Shift+F6).
   * @returns {string|null}
   */
  prevZone() {
    const ordered = this._getOrderedZones();
    if (ordered.length === 0) return null;

    const currentIdx = this._activeZone ? ordered.findIndex(z => z.id === this._activeZone) : ordered.length;
    const prevIdx = currentIdx <= 0 ? ordered.length - 1 : currentIdx - 1;
    const zone = ordered[prevIdx];

    this.moveTo(zone.id);
    return zone.id;
  }

  /**
   * Get the currently active zone.
   * @returns {string|null}
   */
  getActiveZone() {
    return this._activeZone;
  }

  /**
   * Get all registered zones in order.
   * @returns {Array<{id: string, label: string, order: number, isActive: boolean}>}
   */
  getZones() {
    return this._getOrderedZones().map(z => ({
      id: z.id,
      label: z.label,
      order: z.order,
      isActive: z.id === this._activeZone,
    }));
  }

  // ═══════════════════════════════════════════
  // FOCUS TRAP — Modal/panel focus containment
  // ═══════════════════════════════════════════

  /**
   * Trap focus within a zone (for modals, panels).
   * Tab/Shift+Tab will cycle within the zone instead of leaving.
   * @param {string} zoneId
   */
  trap(zoneId) {
    const zone = this._zones.get(zoneId);
    if (zone) {
      zone.trapFocus = true;
      this.moveTo(zoneId);
      this._bus.emit('focus:trapped', { zoneId });
    }
  }

  /**
   * Release a focus trap.
   * @param {string} zoneId
   */
  release(zoneId) {
    const zone = this._zones.get(zoneId);
    if (zone) {
      zone.trapFocus = false;
      this._bus.emit('focus:released', { zoneId });
    }
  }

  /**
   * Enable/disable the focus navigator.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = !!enabled;
  }

  /**
   * Clear all zones.
   */
  clear() {
    this._zones.clear();
    this._elements.clear();
    this._activeZone = null;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Handle keydown for zone navigation */
  _handleKeyDown(event) {
    if (!this._enabled) return;

    // F6 = next zone
    if (event.key === 'F6' && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) {
        this.prevZone();
      } else {
        this.nextZone();
      }
      return;
    }

    // Handle focus trap — Tab within trapped zone
    if (this._activeZone) {
      const zone = this._zones.get(this._activeZone);
      if (zone?.trapFocus && event.key === 'Tab') {
        const el = this._resolveElement(zone);
        if (el) {
          const focusables = this._getAllFocusable(el);
          if (focusables.length > 0) {
            event.preventDefault();
            const currentIdx = focusables.indexOf(document.activeElement);
            let nextIdx;
            if (event.shiftKey) {
              nextIdx = currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1;
            } else {
              nextIdx = (currentIdx + 1) % focusables.length;
            }
            focusables[nextIdx].focus();
          }
        }
      }
    }
  }

  /** @private Track focus to detect which zone is active */
  _handleFocusIn(event) {
    if (!this._enabled) return;
    const target = event.target;

    // Walk up from focused element to find containing zone
    let el = target;
    while (el && el !== document.body) {
      for (const [id, zone] of this._zones) {
        const zoneEl = this._resolveElement(zone);
        if (zoneEl && (zoneEl === el || zoneEl.contains(el))) {
          if (this._activeZone !== id) {
            const prev = this._activeZone;
            this._activeZone = id;

            // Visual indicator
            this._clearZoneHighlights();
            if (zoneEl) zoneEl.classList.add('ctrlk-zone-active');

            this._bus.emit('focus:zone-changed', {
              from: prev,
              to: id,
              label: zone.label,
              source: 'focus',
            });
          }
          return;
        }
      }
      el = el.parentElement;
    }
  }

  /** @private Get zones sorted by order */
  _getOrderedZones() {
    return Array.from(this._zones.values()).sort((a, b) => a.order - b.order);
  }

  /** @private Resolve a zone's DOM element */
  _resolveElement(zone) {
    // Check cache first
    if (this._elements.has(zone.id)) {
      const cached = this._elements.get(zone.id);
      if (cached && document.body.contains(cached)) return cached;
    }

    let el;
    if (typeof zone.element === 'string') {
      el = document.querySelector(zone.element);
    } else {
      el = zone.element;
    }

    this._elements.set(zone.id, el);
    return el;
  }

  /** @private Find the first focusable element inside a container */
  _findFirstFocusable(container) {
    const selectors = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    return container.querySelector(selectors);
  }

  /** @private Get all focusable elements inside a container */
  _getAllFocusable(container) {
    const selectors = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selectors));
  }

  /** @private Remove active highlight from all zones */
  _clearZoneHighlights() {
    for (const [id, zone] of this._zones) {
      const el = this._resolveElement(zone);
      if (el) el.classList.remove('ctrlk-zone-active');
    }
  }
}
