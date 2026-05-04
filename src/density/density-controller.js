/**
 * CtrlK Density Controller — User-controlled information density.
 * Three levels via CSS custom properties. Zero JavaScript layout recalculation.
 * @module @ctrlk/density
 */
const LEVELS = {
  compact: {'--vlx-density':'compact','--vlx-row-height':'28px','--vlx-cell-padding':'2px 6px','--vlx-font-size':'12px','--vlx-font-size-sm':'11px','--vlx-font-size-xs':'9px','--vlx-spacing-xs':'2px','--vlx-spacing-sm':'4px','--vlx-spacing-md':'8px','--vlx-spacing-lg':'12px','--vlx-border-radius':'2px','--vlx-icon-size':'14px','--vlx-chrome-display':'none','--vlx-help-display':'none'},
  comfortable: {'--vlx-density':'comfortable','--vlx-row-height':'40px','--vlx-cell-padding':'6px 12px','--vlx-font-size':'14px','--vlx-font-size-sm':'13px','--vlx-font-size-xs':'11px','--vlx-spacing-xs':'4px','--vlx-spacing-sm':'8px','--vlx-spacing-md':'16px','--vlx-spacing-lg':'24px','--vlx-border-radius':'4px','--vlx-icon-size':'18px','--vlx-chrome-display':'block','--vlx-help-display':'none'},
  spacious: {'--vlx-density':'spacious','--vlx-row-height':'52px','--vlx-cell-padding':'10px 16px','--vlx-font-size':'16px','--vlx-font-size-sm':'14px','--vlx-font-size-xs':'12px','--vlx-spacing-xs':'6px','--vlx-spacing-sm':'12px','--vlx-spacing-md':'24px','--vlx-spacing-lg':'32px','--vlx-border-radius':'6px','--vlx-icon-size':'22px','--vlx-chrome-display':'block','--vlx-help-display':'block'},
};
export class DensityController {
  constructor(bus) { this._bus = bus; this._level = 'comfortable'; }
  init() { try { const s = localStorage.getItem('ctrlk-density'); if (s && LEVELS[s]) this._level = s; } catch(e){} this._apply(); }
  set(level) { if (!LEVELS[level]) return; const p = this._level; this._level = level; this._apply(); try { localStorage.setItem('ctrlk-density', level); } catch(e){} this._bus.emit('density:changed', { level, previous: p }); }
  current() { return this._level; }
  cycle() { const o = ['compact','comfortable','spacious']; this.set(o[(o.indexOf(this._level)+1)%3]); }
  getVars() { return { ...LEVELS[this._level] }; }
  getLevels() { return JSON.parse(JSON.stringify(LEVELS)); }
  _apply() { const v = LEVELS[this._level]; const r = document.documentElement; for (const [p, val] of Object.entries(v)) r.style.setProperty(p, val); r.setAttribute('data-vlx-density', this._level); }
}
