/**
 * CtrlK EventBus — Central nervous system of the runtime.
 * Namespaced events, wildcards, once listeners, error isolation.
 * @module @ctrlk/core/event-bus
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
    this._onceListeners = new Map();
    this._wildcardListeners = new Set();
    this._debug = false;
  }
  on(event, handler) {
    if (typeof handler !== 'function') throw new Error(`[CtrlK] EventBus.on: handler must be a function`);
    if (event === '*') { this._wildcardListeners.add(handler); return () => this._wildcardListeners.delete(handler); }
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => { const s = this._listeners.get(event); if (s) { s.delete(handler); if (!s.size) this._listeners.delete(event); } };
  }
  once(event, handler) {
    if (!this._onceListeners.has(event)) this._onceListeners.set(event, new Set());
    this._onceListeners.get(event).add(handler);
    return () => { const s = this._onceListeners.get(event); if (s) s.delete(handler); };
  }
  emit(event, data) {
    if (this._debug) console.log(`[CtrlK] Event: ${event}`, data);
    const fire = (set) => { for (const h of set) { try { h(data, event); } catch (err) { console.error(`[CtrlK] Error in ${event}:`, err); } } };
    const l = this._listeners.get(event); if (l) fire(l);
    const o = this._onceListeners.get(event); if (o) { fire(o); this._onceListeners.delete(event); }
    const ns = event.split(':')[0]; const nsl = this._listeners.get(`${ns}:*`); if (nsl) fire(nsl);
    if (this._wildcardListeners.size) fire(this._wildcardListeners);
  }
  off(event) {
    if (event === undefined) { this._listeners.clear(); this._onceListeners.clear(); this._wildcardListeners.clear(); }
    else { this._listeners.delete(event); this._onceListeners.delete(event); }
  }
  setDebug(enabled) { this._debug = !!enabled; }
  listenerCount(event) { return (this._listeners.get(event)?.size || 0) + (this._onceListeners.get(event)?.size || 0); }
}
