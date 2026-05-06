# @ctrlk/devextreme

DevExtreme DataGrid adapter for [CtrlK](https://ctrlk.dev) — the first IOUX for enterprise web apps.

Supports DevExtreme v21+.

## Install

```bash
npm i @ctrlk/core @ctrlk/devextreme
```

## Setup

```javascript
import { DevExtremeAdapter } from '@ctrlk/devextreme';
import ctrlk from '@ctrlk/core';

const grid = new DevExpress.ui.dxDataGrid(el, { ... });
const adapter = new DevExtremeAdapter(grid, { keyExpr: 'id' });

ctrlk.views.setGridAdapter(adapter);
```

### Angular Setup

```typescript
// In your component
import { DevExtremeAdapter } from '@ctrlk/devextreme';

@Component({ ... })
export class GridComponent {
  @ViewChild(DxDataGridComponent) grid: DxDataGridComponent;

  ngAfterViewInit() {
    const adapter = new DevExtremeAdapter(
      this.grid.instance,
      { keyExpr: 'dealId' }
    );
    window.ctrlk?.views?.setGridAdapter(adapter);
  }
}
```

## What It Translates

| CtrlK Operation | DevExtreme API Called |
|:---|:---|
| Capture state | `columnOption()` per field |
| Restore state | `columnOption()` per field |
| Show/hide column | `columnOption(field, 'visible', bool)` |
| Scroll to column | `getCellElement()` + `scrollToElement()` |
| Set sort | `columnOption(field, 'sortOrder')` |
| Set filter | `filter()` / `columnOption(field, 'filterValue')` |
| Get selection | `getSelectedRowKeys()` |
| Set selection | `selectRows()` |
| Export | `exportToExcel()` or manual CSV |

## DevExtreme-Specific Features

Beyond the standard GridAdapter interface, this adapter supports DevExtreme-only capabilities:

**Grouping** — `getGrouping()`, `setGrouping(colIds)`, `expandAllGroups()`

**Summary** — `getTotalSummary()` reads footer aggregate rows

**Master-Detail** — `expandDetail(key)`, `collapseDetail(key)`, `isDetailExpanded(key)`

**Batch Editing** — `hasChanges()`, `saveChanges()`, `cancelChanges()`

**Density** — `setDensity('compact' | 'comfortable' | 'spacious')` applies via CSS since DevExtreme lacks a row-height API

## Constructor Options

```javascript
new DevExtremeAdapter(grid, {
  keyExpr: 'id',              // Row key field (default: 'id')
  customStateKeys: [],        // Additional state keys to capture
});
```

## Full API

977 lines covering: state capture/restore, columns (visibility, order, search, flash), rows (get, select, scroll-to), cells (focus, edit, get/set value), filters, sort, scroll, density, events, export, grouping, summary, master-detail, batch editing, and cleanup.

## License

MIT — [ctrlk.dev](https://ctrlk.dev)
