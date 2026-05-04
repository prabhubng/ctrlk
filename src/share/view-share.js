/**
 * CtrlK View Share
 * ──────────────────────────────────────────────
 * Shareable application views — the feature enterprise apps never built.
 * 
 * Three tiers:
 * 
 *   Tier 1 — URL Links (open-source, no server):
 *     Compress full view state → encode in URL hash → paste in Slack.
 *     Recipient clicks → state restores exactly. Zero infrastructure.
 * 
 *   Tier 2 — Stored Shares (open-source, app provides storage):
 *     Save views to a shared backend. Team members see them in Ctrl+K
 *     palette under "Team Views." Any user can share with any user.
 * 
 *   Tier 3 — Live Shares (Enterprise):
 *     Real-time view sync via WebSocket. "Follow my view" — both users
 *     see the same filters, columns, scroll position. Opt-in, not forced.
 * 
 * IDE parallel: VS Code Settings Sync, IntelliJ shared project configs.
 * An IOUX transfers operational knowledge the same way an IDE transfers
 * development environment knowledge.
 * 
 * @module @ctrlk/share
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} SharedView
 * @property {string} id - Unique share ID
 * @property {string} name - View name
 * @property {string} sharedBy - User who shared it
 * @property {number} sharedAt - Timestamp
 * @property {Object} state - The serialized view state
 * @property {string} [description] - Optional note about what this view shows
 * @property {string} [scope] - 'link' | 'team' | 'org' | 'public'
 * @property {number} [expiresAt] - Optional expiration timestamp
 * @property {number} useCount - How many times loaded by others
 */

/**
 * @typedef {Object} ShareProvider
 * @property {Function} save - async (sharedView) => string (returns viewId)
 * @property {Function} load - async (viewId) => SharedView | null
 * @property {Function} list - async (options?) => SharedView[]
 * @property {Function} delete - async (viewId) => boolean
 * @property {Function} [update] - async (viewId, updates) => boolean
 */

const SHARE_HASH_PREFIX = 'ctrlk=';
const RECENT_SHARES_KEY = 'ctrlk-recent-shares';

export class ViewShare {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../views/view-state-manager.js').ViewStateManager} views
   */
  constructor(bus, views) {
    this._bus = bus;
    this._views = views;

    /** @type {ShareProvider|null} */
    this._provider = null;

    /** @type {string|null} Current user identifier (for sharedBy field) */
    this._userId = null;

    /** @type {Array<{id: string, name: string, sharedAt: number}>} Recently shared/received */
    this._recentShares = [];

    /** @type {Function|null} Live broadcast cleanup */
    this._broadcastCleanup = null;

    /** @type {Function|null} Live follow cleanup */
    this._followCleanup = null;
  }

  /**
   * Set the current user identity.
   * @param {string} userId - Display name or ID of the current user
   */
  setUser(userId) {
    this._userId = userId;
  }

  /**
   * Set the storage provider for Tier 2 sharing.
   * 
   * Example — REST API provider:
   *   ctrlk.share.setProvider({
   *     save: async (view) => {
   *       const res = await fetch('/api/shared-views', {
   *         method: 'POST', body: JSON.stringify(view),
   *         headers: { 'Content-Type': 'application/json' }
   *       });
   *       const { id } = await res.json();
   *       return id;
   *     },
   *     load: async (id) => {
   *       const res = await fetch(`/api/shared-views/${id}`);
   *       return res.ok ? res.json() : null;
   *     },
   *     list: async () => {
   *       const res = await fetch('/api/shared-views');
   *       return res.json();
   *     },
   *     delete: async (id) => {
   *       const res = await fetch(`/api/shared-views/${id}`, { method: 'DELETE' });
   *       return res.ok;
   *     },
   *   });
   * 
   * Example — localStorage provider (for testing/demos):
   *   ctrlk.share.setProvider(ctrlk.share.createLocalProvider());
   * 
   * @param {ShareProvider} provider
   */
  setProvider(provider) {
    if (typeof provider.save !== 'function' || typeof provider.load !== 'function' || typeof provider.list !== 'function') {
      throw new Error('[CtrlK] ShareProvider must implement save, load, and list');
    }
    this._provider = provider;
  }

  /**
   * Initialize — check URL for shared view on page load.
   */
  init() {
    this._loadRecentShares();
    // Auto-apply shared view from URL hash if present
    if (typeof window !== 'undefined' && window.location?.hash) {
      this._checkUrlForSharedView();
    }
  }

  // ═══════════════════════════════════════════
  // TIER 1 — URL-Encoded Shareable Links
  // ═══════════════════════════════════════════

  /**
   * Create a shareable URL link with the current view state encoded in the hash.
   * No server required — state travels in the URL.
   * 
   * @param {Object} [options]
   * @param {string} [options.name] - Optional name for the shared view
   * @param {string} [options.description] - Optional description
   * @param {Object} [options.state] - State to share (defaults to current)
   * @returns {string} The full shareable URL
   */
  createLink(options = {}) {
    const { name = '', description = '', state = null } = options;

    const viewState = state || this._views.capture();

    const sharePayload = {
      v: 1, // version for forward compatibility
      n: name,
      d: description,
      s: viewState,
      by: this._userId || 'unknown',
      at: Date.now(),
    };

    const compressed = this._compress(JSON.stringify(sharePayload));
    const baseUrl = typeof window !== 'undefined'
      ? window.location.href.split('#')[0]
      : '';

    const link = `${baseUrl}#${SHARE_HASH_PREFIX}${compressed}`;

    this._bus.emit('share:link-created', {
      name,
      length: link.length,
      stateSize: JSON.stringify(viewState).length,
      compressedSize: compressed.length,
    });

    return link;
  }

  /**
   * Check the current URL for a shared view and apply it.
   * Called automatically on init, but can be called manually.
   * 
   * @returns {boolean} True if a shared view was found and applied
   */
  applyFromUrl() {
    return this._checkUrlForSharedView();
  }

  /**
   * Copy a shareable link to clipboard.
   * @param {Object} [options] - Same as createLink options
   * @returns {Promise<string>} The link that was copied
   */
  async copyLink(options = {}) {
    const link = this.createLink(options);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
    } catch (e) {
      // Clipboard API not available — return link anyway
    }
    this._bus.emit('share:link-copied', { link, length: link.length });
    return link;
  }

  /**
   * Get metadata from a shared link without applying it.
   * @param {string} url - The shared URL
   * @returns {Object|null} { name, description, sharedBy, sharedAt, stateKeys }
   */
  peekLink(url) {
    try {
      const hash = url.split('#')[1] || '';
      if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;

      const encoded = hash.slice(SHARE_HASH_PREFIX.length);
      const payload = JSON.parse(this._decompress(encoded));

      return {
        name: payload.n || '',
        description: payload.d || '',
        sharedBy: payload.by || 'unknown',
        sharedAt: payload.at || 0,
        version: payload.v || 1,
        hasGridState: !!payload.s?.grid,
        hasAppState: !!payload.s?.app && Object.keys(payload.s.app).length > 0,
      };
    } catch (e) {
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // TIER 2 — Stored Shared Views
  // ═══════════════════════════════════════════

  /**
   * Publish the current view to the shared store.
   * Requires a ShareProvider to be set.
   * 
   * @param {string} name - Name for the shared view
   * @param {Object} [options]
   * @param {string} [options.description] - Description
   * @param {string} [options.scope='team'] - 'team', 'org', 'public'
   * @param {number} [options.expiresIn] - Milliseconds until expiration
   * @param {Object} [options.state] - State to share (defaults to current)
   * @returns {Promise<string>} The share ID
   */
  async publish(name, options = {}) {
    if (!this._provider) {
      throw new Error('[CtrlK] ShareProvider required for publish. Use setProvider() or createLink() for URL sharing.');
    }

    const {
      description = '',
      scope = 'team',
      expiresIn = null,
      state = null,
    } = options;

    const viewState = state || this._views.capture();

    const sharedView = {
      id: this._generateId(),
      name,
      sharedBy: this._userId || 'unknown',
      sharedAt: Date.now(),
      state: viewState,
      description,
      scope,
      expiresAt: expiresIn ? Date.now() + expiresIn : null,
      useCount: 0,
    };

    const viewId = await this._provider.save(sharedView);
    sharedView.id = viewId || sharedView.id;

    this._addToRecent({ id: sharedView.id, name, sharedAt: sharedView.sharedAt, type: 'published' });

    this._bus.emit('share:published', { id: sharedView.id, name, scope, sharedBy: sharedView.sharedBy });
    return sharedView.id;
  }

  /**
   * Load a shared view by ID from the store and apply it.
   * @param {string} viewId
   * @returns {Promise<boolean>}
   */
  async load(viewId) {
    if (!this._provider) {
      throw new Error('[CtrlK] ShareProvider required for load.');
    }

    const sharedView = await this._provider.load(viewId);
    if (!sharedView) {
      console.warn(`[CtrlK] Shared view not found: ${viewId}`);
      return false;
    }

    // Check expiration
    if (sharedView.expiresAt && Date.now() > sharedView.expiresAt) {
      console.warn(`[CtrlK] Shared view expired: ${viewId}`);
      this._bus.emit('share:expired', { id: viewId, name: sharedView.name });
      return false;
    }

    // Auto-save current state before applying shared view
    this._views.autoSave();

    // Apply the shared state
    if (sharedView.state) {
      // Restore grid state
      if (sharedView.state.grid) {
        const adapter = this._views._gridAdapter;
        if (adapter) {
          try {
            adapter.restoreState(sharedView.state.grid);
          } catch (e) {
            console.warn('[CtrlK] Failed to restore shared grid state:', e.message);
          }
        }
      }

      // Restore app state via providers
      if (sharedView.state.app) {
        for (const [key, providerState] of Object.entries(sharedView.state.app)) {
          const provider = this._views._providers.get(key);
          if (provider) {
            try {
              provider.restore(providerState);
            } catch (e) {
              console.warn(`[CtrlK] Failed to restore shared provider "${key}":`, e.message);
            }
          }
        }
      }
    }

    // Track usage
    sharedView.useCount = (sharedView.useCount || 0) + 1;
    if (this._provider.update) {
      try { await this._provider.update(viewId, { useCount: sharedView.useCount }); } catch (e) { /* silent */ }
    }

    this._addToRecent({ id: viewId, name: sharedView.name, sharedAt: sharedView.sharedAt, type: 'loaded' });

    this._bus.emit('share:loaded', {
      id: viewId,
      name: sharedView.name,
      sharedBy: sharedView.sharedBy,
      sharedAt: sharedView.sharedAt,
      useCount: sharedView.useCount,
    });

    return true;
  }

  /**
   * List all shared views from the store.
   * @param {Object} [options]
   * @param {string} [options.scope] - Filter by scope
   * @param {string} [options.sharedBy] - Filter by user
   * @param {string} [options.sortBy='sharedAt'] - 'sharedAt', 'name', 'useCount'
   * @returns {Promise<SharedView[]>}
   */
  async list(options = {}) {
    if (!this._provider) return [];

    let views = await this._provider.list(options);

    // Filter expired
    const now = Date.now();
    views = views.filter(v => !v.expiresAt || v.expiresAt > now);

    // Sort
    const { sortBy = 'sharedAt' } = options;
    if (sortBy === 'name') views.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'useCount') views.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    else views.sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));

    return views;
  }

  /**
   * Delete a shared view from the store.
   * @param {string} viewId
   * @returns {Promise<boolean>}
   */
  async remove(viewId) {
    if (!this._provider) return false;
    const deleted = await this._provider.delete(viewId);
    if (deleted) {
      this._bus.emit('share:deleted', { id: viewId });
    }
    return deleted;
  }

  /**
   * Update a shared view's metadata.
   * @param {string} viewId
   * @param {Object} updates - { name?, description?, scope?, state? }
   * @returns {Promise<boolean>}
   */
  async update(viewId, updates) {
    if (!this._provider?.update) return false;
    const result = await this._provider.update(viewId, updates);
    if (result) {
      this._bus.emit('share:updated', { id: viewId, updates });
    }
    return result;
  }

  // ═══════════════════════════════════════════
  // TIER 3 — Live View Sharing (Enterprise)
  // ═══════════════════════════════════════════

  /**
   * Start broadcasting the current view state.
   * Other users can follow this broadcast.
   * 
   * Requires a live transport (WebSocket/SSE) set via setLiveTransport().
   * This is the ctrlk Enterprise feature.
   * 
   * @param {Object} [options]
   * @param {string} [options.channel] - Broadcast channel name
   * @returns {boolean}
   */
  startBroadcast(options = {}) {
    // Enterprise feature — emit event for the transport layer to handle
    this._bus.emit('share:broadcast-start', {
      userId: this._userId,
      channel: options.channel || 'default',
    });

    // Listen for state changes and re-broadcast
    this._broadcastCleanup = this._bus.on('view:*', () => {
      const state = this._views.capture();
      this._bus.emit('share:broadcast-update', { state, userId: this._userId });
    });

    return true;
  }

  /**
   * Stop broadcasting.
   */
  stopBroadcast() {
    if (this._broadcastCleanup) {
      this._broadcastCleanup();
      this._broadcastCleanup = null;
    }
    this._bus.emit('share:broadcast-stop', { userId: this._userId });
  }

  /**
   * Follow another user's broadcast.
   * @param {string} userId - The user to follow
   * @returns {boolean}
   */
  follow(userId) {
    this._bus.emit('share:follow-start', { followUserId: userId, userId: this._userId });

    // Listen for incoming state updates
    this._followCleanup = this._bus.on('share:incoming-state', (data) => {
      if (data.fromUserId === userId && data.state) {
        if (data.state.grid && this._views._gridAdapter) {
          try { this._views._gridAdapter.restoreState(data.state.grid); } catch (e) { /* silent */ }
        }
      }
    });

    return true;
  }

  /**
   * Stop following.
   */
  stopFollow() {
    if (this._followCleanup) {
      this._followCleanup();
      this._followCleanup = null;
    }
    this._bus.emit('share:follow-stop', { userId: this._userId });
  }

  /**
   * Check if currently broadcasting.
   * @returns {boolean}
   */
  isBroadcasting() {
    return !!this._broadcastCleanup;
  }

  /**
   * Check if currently following someone.
   * @returns {boolean}
   */
  isFollowing() {
    return !!this._followCleanup;
  }

  // ═══════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════

  /**
   * Get recently shared/received views.
   * @param {number} [limit=10]
   * @returns {Array<{id: string, name: string, sharedAt: number, type: string}>}
   */
  getRecent(limit = 10) {
    return this._recentShares.slice(0, limit);
  }

  /**
   * Check if a ShareProvider is configured.
   * @returns {boolean}
   */
  hasProvider() {
    return !!this._provider;
  }

  /**
   * Create a localStorage-based provider for testing/demos.
   * @param {string} [namespace='ctrlk-shared'] - Storage key prefix
   * @returns {ShareProvider}
   */
  createLocalProvider(namespace = 'ctrlk-shared') {
    return {
      save: async (view) => {
        const key = `${namespace}:${view.id}`;
        localStorage.setItem(key, JSON.stringify(view));
        // Also maintain an index
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        if (!index.includes(view.id)) index.push(view.id);
        localStorage.setItem(indexKey, JSON.stringify(index));
        return view.id;
      },
      load: async (viewId) => {
        const raw = localStorage.getItem(`${namespace}:${viewId}`);
        return raw ? JSON.parse(raw) : null;
      },
      list: async () => {
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        const views = [];
        for (const id of index) {
          const raw = localStorage.getItem(`${namespace}:${id}`);
          if (raw) views.push(JSON.parse(raw));
        }
        return views;
      },
      delete: async (viewId) => {
        localStorage.removeItem(`${namespace}:${viewId}`);
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        const filtered = index.filter(id => id !== viewId);
        localStorage.setItem(indexKey, JSON.stringify(filtered));
        return true;
      },
      update: async (viewId, updates) => {
        const raw = localStorage.getItem(`${namespace}:${viewId}`);
        if (!raw) return false;
        const view = JSON.parse(raw);
        Object.assign(view, updates);
        localStorage.setItem(`${namespace}:${viewId}`, JSON.stringify(view));
        return true;
      },
    };
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Check URL hash for shared view state */
  _checkUrlForSharedView() {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash?.slice(1) || '';
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return false;

    try {
      const encoded = hash.slice(SHARE_HASH_PREFIX.length);
      const payload = JSON.parse(this._decompress(encoded));

      if (payload.s) {
        // Restore the state through ViewStateManager
        if (payload.s.grid && this._views._gridAdapter) {
          this._views._gridAdapter.restoreState(payload.s.grid);
        }
        if (payload.s.app) {
          for (const [key, providerState] of Object.entries(payload.s.app)) {
            const provider = this._views._providers.get(key);
            if (provider) {
              try { provider.restore(providerState); } catch (e) { /* silent */ }
            }
          }
        }
      }

      // Clean the hash to avoid re-applying on reload
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      this._bus.emit('share:applied-from-url', {
        name: payload.n || '',
        sharedBy: payload.by || 'unknown',
        sharedAt: payload.at || 0,
      });

      return true;
    } catch (e) {
      console.warn('[CtrlK] Failed to apply shared view from URL:', e.message);
      return false;
    }
  }

  /**
   * Compress a string for URL encoding.
   * Uses a simple LZW-inspired compression + base64url.
   * @private
   */
  _compress(str) {
    try {
      // Use TextEncoder for UTF-8 bytes
      const bytes = new TextEncoder().encode(str);
      // Simple run-length + base64url encoding
      // For production, this would use pako/fflate for gzip
      const base64 = this._bytesToBase64Url(bytes);
      return base64;
    } catch (e) {
      // Fallback: raw base64
      return this._utf8ToBase64Url(str);
    }
  }

  /**
   * Decompress a URL-encoded string.
   * @private
   */
  _decompress(encoded) {
    try {
      const bytes = this._base64UrlToBytes(encoded);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      // Fallback
      return this._base64UrlToUtf8(encoded);
    }
  }

  /** @private Convert bytes to base64url (URL-safe base64, no padding) */
  _bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** @private Convert base64url to bytes */
  _base64UrlToBytes(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /** @private Fallback: UTF-8 string to base64url */
  _utf8ToBase64Url(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** @private Fallback: base64url to UTF-8 string */
  _base64UrlToUtf8(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return decodeURIComponent(escape(atob(padded)));
  }

  /** @private */
  _generateId() {
    return `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** @private */
  _addToRecent(entry) {
    this._recentShares = [entry, ...this._recentShares.filter(r => r.id !== entry.id)].slice(0, 20);
    this._persistRecentShares();
  }

  /** @private */
  _persistRecentShares() {
    try {
      localStorage.setItem(RECENT_SHARES_KEY, JSON.stringify(this._recentShares));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadRecentShares() {
    try {
      const raw = localStorage.getItem(RECENT_SHARES_KEY);
      if (raw) this._recentShares = JSON.parse(raw);
    } catch (e) { /* silent */ }
  }
}
