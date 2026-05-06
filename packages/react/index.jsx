/**
 * CtrlK React Adapter
 * ──────────────────────────────────────────────
 * React hooks for deep integration (Pattern C).
 * 
 * Usage:
 *   import { CtrlKProvider, useCtrlkCommand, useCtrlkField } from '@ctrlk/react';
 * 
 *   function App() {
 *     return (
 *       <CtrlKProvider>
 *         <MyGrid />
 *       </CtrlKProvider>
 *     );
 *   }
 * 
 * @module @ctrlk/react
 * @author Prabhu Raja
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ─── Context ───────────────────────────────────

const CtrlKContext = createContext(null);

/**
 * Provider — wraps your app with the ctrlk instance.
 * 
 * Usage:
 *   import ctrlk from '@ctrlk/core';
 *   <CtrlKProvider instance={ctrlk}> ... </CtrlKProvider>
 * 
 * Or without an instance (auto-discovers the global `window.ctrlk`):
 *   <CtrlKProvider> ... </CtrlKProvider>
 */
export function CtrlKProvider({ instance, children }) {
  const ctrlk = instance || (typeof window !== 'undefined' ? window.ctrlk : null);

  if (!ctrlk) {
    console.warn('[CtrlK/React] No ctrlk instance found. Pass it via <CtrlKProvider instance={ctrlk}>');
  }

  return (
    <CtrlKContext.Provider value={ctrlk}>
      {children}
    </CtrlKContext.Provider>
  );
}

/**
 * Access the raw ctrlk instance.
 * @returns {Object} ctrlk runtime
 */
export function useCtrlK() {
  const ctx = useContext(CtrlKContext);
  if (!ctx) {
    throw new Error('[CtrlK/React] useCtrlK must be used inside <CtrlKProvider>');
  }
  return ctx;
}

// ─── useCtrlkCommand ───────────────────────────

/**
 * Register a command from a React component.
 * Auto-unregisters on unmount.
 * 
 * Usage:
 *   useCtrlkCommand({
 *     id: 'grid.refresh',
 *     title: 'Refresh Data',
 *     shortcut: 'Ctrl+R',
 *     execute: () => fetchData(),
 *     undo: (prev) => setData(prev),
 *   });
 * 
 * @param {Object} commandDef - Command definition
 * @param {any[]} [deps] - Dependency array (re-registers when deps change)
 */
export function useCtrlkCommand(commandDef, deps = []) {
  const ctrlk = useCtrlK();
  const defRef = useRef(commandDef);
  defRef.current = commandDef;

  useEffect(() => {
    // Wrap execute so it always calls the latest version
    const wrappedDef = {
      ...defRef.current,
      execute: (...args) => defRef.current.execute(...args),
      undo: defRef.current.undo ? (...args) => defRef.current.undo(...args) : undefined,
      when: defRef.current.when ? () => defRef.current.when() : undefined,
    };

    const unregister = ctrlk.commands.register(wrappedDef);

    // Bind shortcut if provided
    let unbindShortcut;
    if (defRef.current.shortcut) {
      unbindShortcut = ctrlk.keys.bind(defRef.current.shortcut, defRef.current.id, {
        scope: defRef.current.scope || 'global',
      });
    }

    return () => {
      unregister();
      unbindShortcut?.();
    };
  }, deps);
}

// ─── useCtrlkView ──────────────────────────────

/**
 * Bind a piece of component state to ctrlk's ViewState system.
 * When a view is saved, this state is captured.
 * When a view is loaded, this state is restored.
 * 
 * Usage:
 *   const [filters, setFilters] = useCtrlkView('grid.filters', defaultFilters);
 *   // filters is restored when a view is loaded
 *   // setFilters works like normal setState
 * 
 * @param {string} key - Unique key for this state within views
 * @param {*} initialValue
 * @returns {[*, Function]} [state, setState]
 */
export function useCtrlkView(key, initialValue) {
  const ctrlk = useCtrlK();
  const [state, setState] = useState(initialValue);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    // Register as a view state provider
    const unregister = ctrlk.views.registerProvider(key, {
      capture: () => stateRef.current,
      restore: (savedState) => setState(savedState),
    });

    return unregister;
  }, [key]);

  return [state, setState];
}

// ─── useCtrlkSelection ─────────────────────────

/**
 * Access and react to the ctrlk selection model.
 * 
 * Usage:
 *   const { selected, count, toggle, has, clear } = useCtrlkSelection();
 *   
 *   return rows.map(row => (
 *     <Row 
 *       key={row.id} 
 *       selected={has(row.id)}
 *       onClick={() => toggle(row.id)} 
 *     />
 *   ));
 * 
 * @returns {Object} Selection state and methods
 */
export function useCtrlkSelection() {
  const ctrlk = useCtrlK();
  const [count, setCount] = useState(ctrlk.selection.count());

  useEffect(() => {
    const unsub = ctrlk.bus.on('selection:changed', ({ count: c }) => {
      setCount(c);
    });
    return unsub;
  }, []);

  return useMemo(() => ({
    /** Number of selected items */
    count,
    /** Get all selected IDs */
    all: () => ctrlk.selection.all(),
    /** Check if an item is selected */
    has: (id) => ctrlk.selection.has(id),
    /** Toggle selection */
    toggle: (id) => ctrlk.selection.toggle(id),
    /** Add to selection */
    add: (ids) => ctrlk.selection.add(ids),
    /** Remove from selection */
    remove: (ids) => ctrlk.selection.remove(ids),
    /** Clear selection */
    clear: () => ctrlk.selection.clear(),
    /** Select all matching a predicate */
    where: (predicate) => ctrlk.selection.where(predicate),
    /** Save current selection */
    save: (name, opts) => ctrlk.selection.save(name, opts),
    /** Load a named selection */
    load: (name, opts) => ctrlk.selection.loadNamed(name, opts),
    /** Select all */
    selectAll: () => ctrlk.selection.selectAll(),
    /** Invert selection */
    invert: () => ctrlk.selection.invert(),
  }), [count]);
}

// ─── useCtrlkField ─────────────────────────────

/**
 * Register a field from a React component.
 * Auto-discovers the DOM element via ref.
 * 
 * Usage:
 *   function RatingField({ value, onChange }) {
 *     const ref = useCtrlkField({
 *       id: 'ratings.moodys',
 *       label: "Moody's Rating",
 *       section: 'Ratings',
 *       value,
 *       editable: true,
 *       setValue: onChange,
 *     });
 *     
 *     return <input ref={ref} value={value} onChange={e => onChange(e.target.value)} />;
 *   }
 * 
 * @param {Object} fieldDef - Field definition
 * @param {any[]} [deps] - Re-register when deps change
 * @returns {React.RefObject} Ref to attach to the DOM element
 */
export function useCtrlkField(fieldDef, deps = []) {
  const ctrlk = useCtrlK();
  const ref = useRef(null);
  const defRef = useRef(fieldDef);
  defRef.current = fieldDef;

  useEffect(() => {
    const unregister = ctrlk.fields.register({
      ...defRef.current,
      element: ref.current,
      getValue: defRef.current.getValue || (() => defRef.current.value),
      setValue: defRef.current.setValue || undefined,
    });

    return unregister;
  }, deps);

  // Update value tracking when value changes
  useEffect(() => {
    const field = ctrlk.fields.get(defRef.current.id);
    if (field) {
      const newValue = defRef.current.value;
      const originalValue = field.originalValue;
      field.value = newValue;
      field._empty = newValue === null || newValue === undefined ||
        (typeof newValue === 'string' && (newValue.trim() === '' || newValue.toLowerCase() === 'not set'));
      field._dirty = newValue !== originalValue;
    }
  }, [fieldDef.value]);

  return ref;
}

// ─── useCtrlkDensity ───────────────────────────

/**
 * Access and control density level reactively.
 * 
 * Usage:
 *   const { density, setDensity, cycle } = useCtrlkDensity();
 *   return <span>Current: {density}</span>;
 * 
 * @returns {Object} { density, setDensity, cycle }
 */
export function useCtrlkDensity() {
  const ctrlk = useCtrlK();
  const [density, setDensityState] = useState(ctrlk.density.current());

  useEffect(() => {
    const unsub = ctrlk.bus.on('density:changed', ({ level }) => {
      setDensityState(level);
    });
    return unsub;
  }, []);

  return {
    density,
    setDensity: (level) => ctrlk.density.set(level),
    cycle: () => ctrlk.density.cycle(),
  };
}

// ─── useCtrlkEvent ─────────────────────────────

/**
 * Subscribe to a ctrlk event from a React component.
 * Auto-unsubscribes on unmount.
 * 
 * Usage:
 *   useCtrlkEvent('command:executed', ({ id }) => {
 *     console.log('Command ran:', id);
 *   });
 * 
 * @param {string} event
 * @param {Function} handler
 * @param {any[]} [deps]
 */
export function useCtrlkEvent(event, handler, deps = []) {
  const ctrlk = useCtrlK();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return ctrlk.bus.on(event, (...args) => handlerRef.current(...args));
  }, deps);
}

// ─── useCtrlkScope ─────────────────────────────

/**
 * Declare a shortcut scope on a component.
 * Returns a ref to attach to the scoped container element.
 * 
 * Usage:
 *   function GridPanel() {
 *     const scopeRef = useCtrlkScope('grid', { parent: 'main' });
 *     return <div ref={scopeRef} data-ctrlk-scope="grid">...</div>;
 *   }
 * 
 * @param {string} scopeId
 * @param {Object} [options]
 * @param {string} [options.parent='global']
 * @returns {React.RefObject}
 */
export function useCtrlkScope(scopeId, options = {}) {
  const ctrlk = useCtrlK();
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ctrlk.keys.registerScope(scopeId, {
        element: ref.current,
        parent: options.parent || 'global',
      });
    }
  }, [scopeId]);

  return ref;
}

// ─── Component: CtrlKFieldGroup ────────────────

/**
 * Declarative wrapper that registers all child fields in a section.
 * 
 * Usage:
 *   <CtrlKFieldGroup section="Ratings" scope="ratings">
 *     <RatingField ... />
 *     <RatingField ... />
 *   </CtrlKFieldGroup>
 */
export function CtrlKFieldGroup({ section, scope, children, ...rest }) {
  const ctrlk = useCtrlK();
  const ref = useRef(null);

  useEffect(() => {
    if (scope && ref.current) {
      ctrlk.keys.registerScope(scope, {
        element: ref.current,
        parent: 'global',
      });
    }
  }, [scope]);

  return (
    <div
      ref={ref}
      data-ctrlk-section={section}
      data-ctrlk-scope={scope}
      {...rest}
    >
      {children}
    </div>
  );
}
