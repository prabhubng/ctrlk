# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-04

### Added
- **ViewShare** module — shareable view links via URL hash encoding (Tier 1), stored sharing with provider interface (Tier 2), live sharing API (Tier 3 Enterprise)
- **DevExtreme adapter** (`@ctrlk/devextreme`) — 977-line full adapter with grouping, summary, master-detail, and batch editing support
- **ViewStateManager** max views with LRU eviction — default 5 saved views, oldest-used evicted when full
- **ViewStateManager** slot system — saved views get Ctrl+1 through Ctrl+5 shortcuts
- Column chooser panel — toggle column visibility with search and "Essential Only" preset
- My Views dropdown — persistent panel replacing the old toast-based view listing
- URL hash reader — shared view links (`#ctrlk=...`) auto-apply on page load
- 8 new ViewStateManager tests (LRU eviction, slots, max views)

### Changed
- Palette overlay now uses `pointer-events: none` when hidden (fixes nav click blocking)
- Bundle size: 110 KB → 125 KB (new modules)
- Test count: 121 → 150

### Fixed
- Command palette overlay blocking all page clicks when hidden (z-index 99998 with opacity:0 but no pointer-events:none)
- DevExtreme column jump not scrolling (removed `columnRenderingMode: 'virtual'` which prevented off-screen column DOM access)
- DevExtreme saved view loading (replaced unreliable `dxGrid.state()` serialization with per-column `columnOption()` save/restore)

## [1.0.0] - 2026-05-04

### Added
- **Core**: EventBus, CommandRegistry, ShortcutEngine, CommandPalette, DensityController, AutoDiscovery
- **State**: ViewStateManager, SelectionModel, FieldRegistry, GridAdapter
- **Power**: MacroEngine, HistoryManager, ActiveFilterBar
- **Navigation**: ColumnNavigator, FocusNavigator, SessionTracker
- **Adapters**: `@ctrlk/ag-grid` (670 lines), `@ctrlk/react` (382 lines, 7 hooks), `@ctrlk/angular` (492 lines, service + 4 directives)
- 5 demo applications (Vanilla JS, React 18, Vue 3, AG Grid, DevExtreme)
- Website with IOUX positioning, problem statement, API documentation
- 150 tests across 4 test suites, zero dependencies
- 125 KB minified bundle
