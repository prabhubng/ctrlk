# Changelog

## [2.0.0] - 2026-05-06

### Core Architecture
- Headless engine — zero DOM, zero styles, pure event-driven
- `onPaletteRequest(callback)` — palette shortcut emits event with `{ commands, search(), execute() }`
- `onFieldJumpRequest(callback)` — field jump emits event with `{ fields, search(), focus() }`
- `onShortcutsRequest(callback)` — shortcuts overlay emits event with `{ shortcuts }`
- `onDensityChange(callback)`, `onViewSaved()`, `onViewLoaded()`, `onCommandExecuted()` hooks
- Event payloads include callable `search()` and `execute()` functions for direct framework integration
- Capture-phase keyboard interceptor prevents Chrome from stealing Ctrl+K

### Adapters
- `@ctrlk/devextreme` — 977-line adapter with grouping, summary, master-detail, batch editing
- `@ctrlk/ag-grid` — 670-line adapter for AG Grid v28-31+
- `@ctrlk/react` — 7 hooks + CtrlKProvider
- `@ctrlk/angular` — Service + 4 directives

### Modules (19 total, 150 tests)
- **Core**: EventBus, CommandRegistry, ShortcutEngine, DensityController, AutoDiscovery
- **State**: ViewStateManager (max views, LRU eviction, Ctrl+1-5 slots), SelectionModel, FieldRegistry, GridAdapter
- **Power**: MacroEngine, HistoryManager, ActiveFilterBar
- **Navigation**: ColumnNavigator, FocusNavigator, SessionTracker
- **Share**: ViewShare (URL links, stored sharing, live sharing)
