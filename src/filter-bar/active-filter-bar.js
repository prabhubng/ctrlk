/**
 * CtrlK Active Filter Bar
 * ──────────────────────────────────────────────
 * Visual strip showing all active filters as dismissible chips.
 * 
 * Solves the visibility half of Problem #7:
 * ViewStateManager handles persistence.
 * ActiveFilterBar handles display.
 * 
 * The bar shows:
 *   - Each active filter as a chip (column name + value)
 *   - Click X to remove a single filter
 *   - "Clear all" button
 *   - "Save as view" button (opens view naming)
 *   - Filter count badge
 * 
 * Self-contained UI — injects its own DOM and styles.
 * Designed to sit at the top of any grid, regardless of CSS framework.
 * 
 * @module @ctrlk/filter-bar
 * @author Prabhu Raja
 */

const FILTER_BAR_STYLES = `
.ctrlk-filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--ctrlk-fb-bg, #f0f4f8);
  border: 1px solid var(--ctrlk-fb-border, #d0d7de);
  border-radius: var(--vlx-border-radius, 4px);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: var(--vlx-font-size-sm, 12px);
  flex-wrap: wrap;
  min-height: 32px;
  transition: all 0.2s;
}
.ctrlk-filter-bar:empty,
.ctrlk-filter-bar.ctrlk-fb-hidden { display: none; }

.ctrlk-filter-bar.ctrlk-fb-dark {
  --ctrlk-fb-bg: #161b22;
  --ctrlk-fb-border: #30363d;
  --ctrlk-chip-bg: #21262d;
  --ctrlk-chip-border: #30363d;
  --ctrlk-chip-text: #c9d1d9;
  --ctrlk-chip-label: #8b949e;
  --ctrlk-chip-x: #8b949e;
  --ctrlk-chip-x-hover: #f85149;
  --ctrlk-action-text: #58a6ff;
}

.ctrlk-fb-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ctrlk-chip-label, #656d76);
  margin-right: 4px;
  flex-shrink: 0;
}

.ctrlk-fb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--ctrlk-chip-bg, #ddf4ff);
  border: 1px solid var(--ctrlk-chip-border, #a8d8f0);
  border-radius: 3px;
  font-size: 11px;
  color: var(--ctrlk-chip-text, #1a3a4a);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.ctrlk-fb-chip-col {
  font-weight: 600;
  margin-right: 2px;
}

.ctrlk-fb-chip-val {
  font-weight: 400;
  opacity: 0.85;
}

.ctrlk-fb-chip-x {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--ctrlk-chip-x, #656d76);
  padding: 0 2px;
  margin-left: 2px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.ctrlk-fb-chip-x:hover { color: var(--ctrlk-chip-x-hover, #cf222e); }

.ctrlk-fb-divider {
  width: 1px;
  height: 16px;
  background: var(--ctrlk-fb-border, #d0d7de);
  margin: 0 4px;
  flex-shrink: 0;
}

.ctrlk-fb-action {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--ctrlk-action-text, #0969da);
  font-family: inherit;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.ctrlk-fb-action:hover { background: var(--ctrlk-chip-bg, #ddf4ff); }

.ctrlk-fb-count {
  font-size: 10px;
  color: var(--ctrlk-chip-label, #656d76);
  margin-left: auto;
  flex-shrink: 0;
}
`;

export class ActiveFilterBar {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../views/view-state-manager.js').ViewStateManager} [views]
   * @param {import('../grid/grid-adapter.js').GridAdapter} [gridAdapter]
   */
  constructor(bus, views, gridAdapter) {
    this._bus = bus;
    this._views = views || null;
    this._grid = gridAdapter || null;

    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {HTMLElement|null} */
    this._barElement = null;

    /** @type {string} 'light' or 'dark' */
    this._theme = 'light';

    this._injected = false;
  }

  /**
   * Set the grid adapter.
   * @param {import('../grid/grid-adapter.js').GridAdapter} adapter
   */
  setGridAdapter(adapter) {
    this._grid = adapter;
  }

  /**
   * Set the view state manager.
   * @param {import('../views/view-state-manager.js').ViewStateManager} views
   */
  setViewStateManager(views) {
    this._views = views;
  }

  /**
   * Inject the filter bar into the DOM.
   * @param {string|Element} container - Where to insert the bar (CSS selector or element)
   * @param {Object} [options]
   * @param {string} [options.position='prepend'] - 'prepend', 'append', 'before', 'after'
   * @param {string} [options.theme='light'] - 'light' or 'dark'
   */
  inject(container, options = {}) {
    const { position = 'prepend', theme = 'light' } = options;

    if (this._injected) return;

    this._theme = theme;

    // Inject styles
    if (!document.getElementById('ctrlk-filter-bar-styles')) {
      const style = document.createElement('style');
      style.id = 'ctrlk-filter-bar-styles';
      style.textContent = FILTER_BAR_STYLES;
      document.head.appendChild(style);
    }

    // Create bar element
    this._barElement = document.createElement('div');
    this._barElement.className = `ctrlk-filter-bar ${theme === 'dark' ? 'ctrlk-fb-dark' : ''}`;
    this._barElement.setAttribute('role', 'toolbar');
    this._barElement.setAttribute('aria-label', 'Active filters');

    // Insert into container
    const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
    if (!containerEl) {
      console.warn('[CtrlK] Filter bar container not found:', container);
      return;
    }

    this._container = containerEl;
    switch (position) {
      case 'append': containerEl.appendChild(this._barElement); break;
      case 'before': containerEl.parentNode?.insertBefore(this._barElement, containerEl); break;
      case 'after': containerEl.parentNode?.insertBefore(this._barElement, containerEl.nextSibling); break;
      default: containerEl.prepend(this._barElement);
    }

    // Listen for filter changes
    if (this._grid) {
      this._grid.onGridEvent?.('filterChanged', () => this.refresh());
    }

    this._injected = true;
    this.refresh();
  }

  /**
   * Refresh the filter bar to reflect current filter state.
   */
  refresh() {
    if (!this._barElement || !this._grid) return;

    const filters = this._grid.getFilters();

    if (filters.length === 0) {
      this._barElement.classList.add('ctrlk-fb-hidden');
      this._barElement.innerHTML = '';
      return;
    }

    this._barElement.classList.remove('ctrlk-fb-hidden');

    let html = `<span class="ctrlk-fb-label">Filters</span>`;

    for (const filter of filters) {
      const colName = this._getColumnName(filter.colId);
      const displayValue = this._formatFilterValue(filter);

      html += `
        <span class="ctrlk-fb-chip" data-col="${filter.colId}" title="${colName}: ${displayValue}">
          <span class="ctrlk-fb-chip-col">${colName}</span>
          <span class="ctrlk-fb-chip-val">${displayValue}</span>
          <button class="ctrlk-fb-chip-x" data-remove="${filter.colId}" aria-label="Remove ${colName} filter">×</button>
        </span>
      `;
    }

    html += `<span class="ctrlk-fb-divider"></span>`;
    html += `<button class="ctrlk-fb-action" data-action="clear-all">Clear all</button>`;

    if (this._views) {
      html += `<button class="ctrlk-fb-action" data-action="save-view">Save as view</button>`;
    }

    html += `<span class="ctrlk-fb-count">${filters.length} active</span>`;

    this._barElement.innerHTML = html;

    // Attach handlers
    this._barElement.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const colId = btn.getAttribute('data-remove');
        this._removeFilter(colId);
      });
    });

    this._barElement.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
      this._clearAll();
    });

    this._barElement.querySelector('[data-action="save-view"]')?.addEventListener('click', () => {
      this._bus.emit('filterbar:save-view-requested', {});
    });
  }

  /**
   * Set the visual theme.
   * @param {'light'|'dark'} theme
   */
  setTheme(theme) {
    this._theme = theme;
    if (this._barElement) {
      this._barElement.classList.toggle('ctrlk-fb-dark', theme === 'dark');
    }
  }

  /**
   * Get the current filter count.
   * @returns {number}
   */
  getFilterCount() {
    if (!this._grid) return 0;
    return this._grid.getFilters().length;
  }

  /**
   * Destroy the filter bar.
   */
  destroy() {
    if (this._barElement) {
      this._barElement.remove();
      this._barElement = null;
    }
    this._injected = false;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _removeFilter(colId) {
    if (this._views) {
      this._views.removeFilter(colId);
    } else if (this._grid) {
      const filters = this._grid.getFilters().filter(f => f.colId !== colId);
      this._grid.setFilters(filters);
    }
    this.refresh();
    this._bus.emit('filterbar:filter-removed', { colId });
  }

  /** @private */
  _clearAll() {
    if (this._grid) {
      this._grid.clearFilters();
    }
    this.refresh();
    this._bus.emit('filterbar:cleared', {});
  }

  /** @private Get column display name from ID */
  _getColumnName(colId) {
    if (this._grid) {
      const cols = this._grid.getColumns();
      const col = cols.find(c => c.colId === colId);
      if (col) return col.headerName || colId;
    }
    return colId;
  }

  /** @private Format a filter value for display */
  _formatFilterValue(filter) {
    const val = filter.value;
    if (val === null || val === undefined) return '(any)';
    if (Array.isArray(val)) return val.slice(0, 3).join(', ') + (val.length > 3 ? ` +${val.length - 3}` : '');
    if (typeof val === 'object') {
      if (val.from !== undefined && val.to !== undefined) return `${val.from} – ${val.to}`;
      return JSON.stringify(val).slice(0, 30);
    }
    const str = String(val);
    const op = filter.operator || '';
    const opSymbol = { equals: '=', contains: '≈', greaterThan: '>', lessThan: '<', startsWith: 'starts' }[op] || '';
    return opSymbol ? `${opSymbol} ${str}` : str;
  }
}
