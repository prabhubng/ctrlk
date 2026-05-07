# CtrlK

**The first IOUX for enterprise web apps.**

CtrlK is a headless interaction engine that adds commands, keyboard shortcuts, saved views, field navigation, macros, and shareable state to any enterprise web application. It provides the logic — your app provides the UI using your own framework and design system.

> An **IOUX** (Integrated Operational UX) is to application operators what an IDE is to developers.

[![npm](https://img.shields.io/npm/v/@ctrlk/core)](https://www.npmjs.com/package/@ctrlk/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-150%20passing-brightgreen)](#)

---

## How It Works

CtrlK is headless — zero DOM, zero styles. When a shortcut fires, the engine emits an event. Your app catches it and renders its own component.

```typescript
import ctrlk from '@ctrlk/core';

ctrlk.init({ palette: true, density: true });

// Register commands
ctrlk.commands.register({
  id: 'deals.refresh',
  title: 'Refresh Deals',
  shortcut: 'Ctrl+R',
  category: 'Deals',
  execute: () => refreshGrid(),
});

// When Ctrl+K fires — YOUR app renders YOUR palette component
ctrlk.onPaletteRequest(({ commands, search, execute }) => {
  openMyPaletteDialog({ commands, search, execute });
});

// When Ctrl+G fires — YOUR app renders YOUR field search
ctrlk.onFieldJumpRequest(({ fields, search, focus }) => {
  openMyFieldJumpDialog({ fields, search, focus });
});
```

## Install

```bash
npm install @ctrlk/core

# Grid adapters
npm install @ctrlk/ag-grid      # AG Grid v28-31+
npm install @ctrlk/devextreme   # DevExtreme v21+

# Framework adapters
npm install @ctrlk/react        # React hooks
npm install @ctrlk/angular      # Angular service + directives
```

## Framework Integration

### Angular + DevExtreme

```typescript
import { Injectable, NgZone } from '@angular/core';
import ctrlk from '@ctrlk/core';
import { DevExtremeAdapter } from '@ctrlk/devextreme';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CtrlkService {
  readonly paletteRequested$ = new Subject();

  init() {
    ctrlk.init({ palette: true, density: true });
    ctrlk.onPaletteRequest((req) => this.paletteRequested$.next(req));
  }

  bridgeGrid(gridInstance, keyExpr = 'id') {
    ctrlk.connectGrid(new DevExtremeAdapter(gridInstance, { keyExpr }));
  }
}
```

### React

```tsx
import ctrlk from '@ctrlk/core';
import { useEffect, useState } from 'react';

function useCtrlkPalette() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    return ctrlk.onPaletteRequest((req) => {
      setRequest(req);
      setOpen(true);
    });
  }, []);

  return { open, request, close: () => setOpen(false) };
}
```

### Vue 3

```javascript
import { ref, onMounted, onUnmounted } from 'vue';
import ctrlk from '@ctrlk/core';

export function useCtrlkPalette() {
  const open = ref(false);
  const request = ref(null);
  let unsub;

  onMounted(() => {
    unsub = ctrlk.onPaletteRequest((req) => {
      request.value = req;
      open.value = true;
    });
  });
  onUnmounted(() => unsub?.());

  return { open, request, close: () => (open.value = false) };
}
```

## What's Inside

**19 modules. 150 tests. Zero dependencies. 125 KB minified.**

### Engine
| Module | Purpose |
|--------|---------|
| **CommandRegistry** | Register, search, and execute commands |
| **ShortcutEngine** | Scope-aware keyboard shortcuts with chord support |
| **ViewStateManager** | Save, load, share named view configurations (LRU, slots) |
| **FieldRegistry** | Field-level search, focus, dirty tracking, completeness |
| **SelectionModel** | Cross-page persistent selections with set operations |
| **DensityController** | Compact / comfortable / spacious via CSS custom properties |
| **MacroEngine** | Record and replay command sequences |
| **HistoryManager** | Application-level undo/redo |

### Navigation
| Module | Purpose |
|--------|---------|
| **ColumnNavigator** | Column search, bookmarks, horizontal jump |
| **FocusNavigator** | F6 zone navigation between UI areas |
| **SessionTracker** | Batch review progress tracking |

### Sharing
| Module | Purpose |
|--------|---------|
| **ViewShare** | Shareable view links via URL encoding, stored sharing, live sharing |

## Grid Adapters

| Library | Package | Lines |
|---------|---------|-------|
| AG Grid v28-31+ | `@ctrlk/ag-grid` | 670 |
| DevExtreme v21+ | `@ctrlk/devextreme` | 977 |

The DevExtreme adapter includes grouping, summary, master-detail, and batch editing support beyond the standard GridAdapter interface.

## Event Hooks

| Hook | Fires When | Payload |
|------|-----------|---------|
| `onPaletteRequest(cb)` | Ctrl+K pressed | `{ commands, search(q), execute(id) }` |
| `onFieldJumpRequest(cb)` | Ctrl+G pressed | `{ fields, search(q), focus(id) }` |
| `onShortcutsRequest(cb)` | Ctrl+/ pressed | `{ shortcuts }` |
| `onDensityChange(cb)` | Density cycles | `{ level, previous }` |
| `onViewSaved(cb)` | View saved | `{ name, slot, shortcut }` |
| `onViewLoaded(cb)` | View loaded | `{ name }` |
| `onCommandExecuted(cb)` | Command runs | `{ id, result }` |

Each returns an unsubscribe function.

## Default Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Palette request |
| `Ctrl+G` | Field jump request |
| `Ctrl+D` | Cycle density |
| `Ctrl+1` – `Ctrl+5` | Load saved view by slot |
| `Ctrl+Shift+S` | Share current view |
| `Ctrl+/` | Shortcuts request |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |

All shortcuts are customizable.

## Documentation

- [API Reference](https://ctrlk.dev/docs/api.html)
- [Live Demos](https://ctrlk.dev)
- [GitHub](https://github.com/prabhubng/ctrlk)

## License

MIT — Created by [Prabhu Raja](https://github.com/prabhubng)
