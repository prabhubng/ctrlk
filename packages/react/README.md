# @ctrlk/react

React hooks and Provider for [CtrlK](https://ctrlk.dev) — the first IOUX for enterprise web apps.

## Install

```bash
npm i @ctrlk/core @ctrlk/react
```

## Setup

```jsx
import { CtrlKProvider } from '@ctrlk/react';
import ctrlk from '@ctrlk/core';

function App() {
  return (
    <CtrlKProvider instance={ctrlk}>
      <YourApp />
    </CtrlKProvider>
  );
}
```

## Hooks

| Hook | Description |
|------|-------------|
| `useCtrlkCommand(def, deps)` | Register a command. Auto-unregisters on unmount. |
| `useCtrlkView(key, default)` | Two-way binding to a view state value. |
| `useCtrlkDensity()` | Returns current density level. |
| `useCtrlkSelection()` | Returns `[selected, { select, deselect, toggle, clear }]`. |
| `useCtrlkField(fieldId, options)` | Register a form field for jump-to and tracking. |
| `useCtrlkShortcut(shortcut, handler)` | Bind a shortcut inside a component. |
| `useCtrlk()` | Access the raw CtrlK instance. |

## Example

```jsx
import { useCtrlkCommand } from '@ctrlk/react';

function DataGrid() {
  useCtrlkCommand({
    id: 'grid.refresh',
    title: 'Refresh Data',
    shortcut: 'Ctrl+R',
    execute: () => fetchData(),
  }, []);

  return <Grid />;
}
```

## License

MIT — [ctrlk.dev](https://ctrlk.dev)
