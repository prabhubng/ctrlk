# @ctrlk/ag-grid

AG Grid adapter for [CtrlK](https://ctrlk.dev) — the first IOUX for enterprise web apps.

Supports AG Grid Community and Enterprise v28-31+.

## Install

```bash
npm i @ctrlk/core @ctrlk/ag-grid
```

## Setup

```javascript
import { AgGridAdapter } from '@ctrlk/ag-grid';
import ctrlk from '@ctrlk/core';

const gridOptions = {
  onGridReady: (params) => {
    const adapter = new AgGridAdapter(params.api);
    ctrlk.views.setGridAdapter(adapter);
  },
};
```

## What It Translates

| CtrlK Operation | AG Grid API Called |
|:---|:---|
| Capture state | `getColumnState()` + `getFilterModel()` |
| Restore state | `applyColumnState()` + `setFilterModel()` |
| Show/hide column | `applyColumnState({ state: [{ colId, hide }] })` |
| Scroll to column | `ensureColumnVisible(colId)` |
| Highlight column | `flashCells({ columns: [colId] })` |
| Set row height | `updateGridOptions({ rowHeight })` + `resetRowHeights()` |
| Export CSV | `exportDataAsCsv()` |

## Features

- State capture and restore (columns, filters, sort, scroll position)
- Column visibility, ordering, and pinning
- Row selection with cross-page persistence
- Cell focus, editing, and flash highlighting
- Density control (compact / comfortable / spacious)
- CSV and JSON export
- Event bridging (selection, filter, sort changes)

670 lines. Full GridAdapter interface implementation.

## License

MIT — [ctrlk.dev](https://ctrlk.dev)
