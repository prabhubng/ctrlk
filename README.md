# CtrlK

**The first IOUX for enterprise web apps.**

CtrlK is an interaction layer that sits between your users and your application. Command palette, keyboard shortcuts, saved views, persistent selections, field navigation, macros, undo, and shareable view links — on top of any existing enterprise web app. No redesign required.

> An **IOUX** (Integrated Operational UX) is to application operators what an IDE is to developers.

[![npm](https://img.shields.io/npm/v/@ctrlk/core)](https://www.npmjs.com/package/@ctrlk/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-150%20passing-brightgreen)](#)

---

## Quick Start

### Pattern A — Drop-in (30 seconds)

```html
<script src="https://unpkg.com/@ctrlk/core/dist/ctrlk.runtime.min.js"></script>
<!-- That's it. Ctrl+K is now live. -->
```

### Pattern B — Programmatic

```js
import ctrlk from '@ctrlk/core';

ctrlk.init({ palette: true, density: true, autoDiscover: true });

ctrlk.commands.register({
  id: 'filter.active',
  title: 'Show Active Only',
  shortcut: 'Alt+A',
  category: 'Filters',
  execute: () => applyFilter('active'),
});
```

### Pattern C — Framework Integration

```js
// React
import { useCtrlkCommand } from '@ctrlk/react';

useCtrlkCommand({
  id: 'grid.refresh',
  title: 'Refresh Data',
  shortcut: 'Ctrl+R',
  execute: () => fetchData(),
}, []);
```

## Install

```bash
npm install @ctrlk/core

# Framework adapters
npm install @ctrlk/react        # React hooks + Provider
npm install @ctrlk/angular      # Service + directives
npm install @ctrlk/ag-grid      # AG Grid adapter
npm install @ctrlk/devextreme   # DevExtreme adapter
```

## What's Inside

**19 modules. 150 tests. Zero dependencies. 125 KB minified.**

### Core
| Module | What it does |
|--------|-------------|
| **EventBus** | Internal event system — all modules communicate through this |
| **CommandRegistry** | Central registry of all commands with search and execute |
| **ShortcutEngine** | Scope-aware keyboard shortcuts with chord support |
| **CommandPalette** | The Ctrl+K searchable command UI |
| **DensityController** | Compact / comfortable / spacious density cycling |
| **AutoDiscovery** | Scans DOM, auto-registers buttons and links as commands |

### State
| Module | What it does |
|--------|-------------|
| **ViewStateManager** | Save, restore, share complete view states (max 5, LRU eviction) |
| **SelectionModel** | Cross-page persistent selections with named sets and set operations |
| **FieldRegistry** | Field-level navigation, dirty tracking, pinning, completeness |
| **GridAdapter** | Abstract interface that grid-specific adapters implement |

### Power
| Module | What it does |
|--------|-------------|
| **MacroEngine** | Record, parameterize, and replay command sequences |
| **HistoryManager** | Application-level undo/redo with branching |
| **ActiveFilterBar** | Dismissible filter chips for active filters |

### Navigation
| Module | What it does |
|--------|-------------|
| **ColumnNavigator** | Column search (Ctrl+G), bookmarks, horizontal jump |
| **FocusNavigator** | F6 zone navigation between toolbar, grid, sidebar |
| **SessionTracker** | Batch review progress — "12/30 reviewed" |

### Share
| Module | What it does |
|--------|-------------|
| **ViewShare** | Shareable view links (URL, stored, live) — 3 tiers |

## Framework Support

| Framework | Package | Status |
|-----------|---------|--------|
| React | `@ctrlk/react` | 7 hooks + Provider |
| Angular | `@ctrlk/angular` | Service + 4 directives |
| Vue 3 | — | Composables (coming) |

## Grid Adapters

| Grid Library | Package | Status |
|-------------|---------|--------|
| AG Grid v28-31+ | `@ctrlk/ag-grid` | Full adapter (670 lines) |
| DevExtreme v21+ | `@ctrlk/devextreme` | Full adapter (977 lines) |
| Kendo | — | Coming |

CtrlK works **alongside** your grid library — it doesn't replace it. The adapter translates between CtrlK's commands and your grid's API.

## Default Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Ctrl+G` | Jump to column / field |
| `Ctrl+D` | Cycle density |
| `Ctrl+1` – `Ctrl+5` | Load saved view by slot |
| `Ctrl+Shift+S` | Share current view |
| `Alt+N` | Next unreviewed / empty |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `F6` | Next focus zone |

All shortcuts are customizable.

## Live Demos

- [HR Employee Directory](https://ctrlk.dev/demos/demo-hr-directory.html) — Vanilla JS, 25 columns
- [Support Ticket Queue](https://ctrlk.dev/demos/demo-support-tickets.html) — React 18, batch review
- [Patient Record](https://ctrlk.dev/demos/demo-patient-record.html) — Vue 3, field navigation
- [Inventory (AG Grid)](https://ctrlk.dev/demos/demo-inventory-aggrid.html) — AG Grid v31, saved views
- [Inventory (DevExtreme)](https://ctrlk.dev/demos/demo-inventory-devextreme.html) — Same app, different grid

## Documentation

- [API Reference](https://ctrlk.dev/docs/api.html) — Full developer documentation
- [Problem Statement](https://ctrlk.dev/docs/problem-statement.html) — The OpUX Failure Catalog
- [Implementation Guide](https://ctrlk.dev/demos/guide.html) — Step-by-step for all 5 demos

## The OpUX Thesis

Enterprise software users spend 4-8 hours daily in data-heavy applications. They develop workflows, mental models, and muscle memory — but most enterprise UIs treat them like tourists. CtrlK treats them like residents.

**OpUX** (Operational UX) is the discipline of designing for these power users. An IOUX is the implementation layer.

## License

MIT — Created by [Prabhu Raja](https://github.com/prabhubng), [LinkedIn](https://www.linkedin.com/in/prabhuraja/)

Enterprise features and support available from [NeuralWeaves Technologies](https://neuralweaves.com).
