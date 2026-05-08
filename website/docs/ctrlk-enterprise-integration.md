# CtrlK v2 — Enterprise Integration Guide

**Headless core. Your UI. Your framework. Your theme.**

CtrlK v2 is a pure engine — zero DOM, zero styles, zero opinions about how your palette looks. When the user presses Ctrl+K, CtrlK emits an event. Your app catches it and renders its own component using your existing design system.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Your Application               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Angular  │  │ DevExtr  │  │ Your CSS  │  │
│  │Component │  │ DxPopup  │  │ Theme     │  │
│  └────▲─────┘  └────▲─────┘  └───────────┘  │
│       │              │                       │
│  ┌────┴──────────────┴────────────────────┐  │
│  │         Event Hooks Layer              │  │
│  │  onPaletteRequest()                    │  │
│  │  onFieldJumpRequest()                  │  │
│  │  onDensityChange()                     │  │
│  └────────────────▲───────────────────────┘  │
│                   │                          │
│  ┌────────────────┴───────────────────────┐  │
│  │        @ctrlk/core (headless)          │  │
│  │  commands · keys · views · fields      │  │
│  │  density · selection · macros · history │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Install

```bash
npm i @ctrlk/core
npm i @ctrlk/devextreme   # if using DevExtreme grids
```

---

## Angular + DevExtreme (Enterprise Pattern)

### 1. Service — `ctrlk-runtime.service.ts`

```typescript
import { Injectable, NgZone } from '@angular/core';
import ctrlk from '@ctrlk/core';
import { DevExtremeAdapter } from '@ctrlk/devextreme';
import { Subject } from 'rxjs';
import type dxDataGrid from 'devextreme/ui/data_grid';

export interface PaletteRequest {
  commands: any[];
  search: (q: string) => any[];
  execute: (id: string) => void;
}

export interface FieldJumpRequest {
  fields: any[];
  search: (q: string, opts?: any) => any[];
  focus: (id: string) => void;
}

@Injectable({ providedIn: 'root' })
export class CtrlkRuntimeService {
  private initialized = false;

  // Observables your components subscribe to
  readonly paletteRequested$ = new Subject<PaletteRequest>();
  readonly fieldJumpRequested$ = new Subject<FieldJumpRequest>();
  readonly densityChanged$ = new Subject<{ level: string }>();

  constructor(private zone: NgZone) {}

  init(options: Partial<Parameters<typeof ctrlk.init>[0]> = {}): void {
    if (this.initialized) return;

    ctrlk.init({
      palette: true,
      density: true,
      autoDiscover: false,
      ...options,
    });

    // Bridge events into Angular zone + RxJS
    ctrlk.onPaletteRequest((data) => {
      this.zone.run(() => this.paletteRequested$.next(data));
    });

    ctrlk.onFieldJumpRequest((data) => {
      this.zone.run(() => this.fieldJumpRequested$.next(data));
    });

    ctrlk.onDensityChange((data) => {
      this.zone.run(() => this.densityChanged$.next(data));
    });

    this.initialized = true;
  }

  bridgeGrid(gridInstance: dxDataGrid, keyExpr = 'id'): void {
    this.init();
    const adapter = new DevExtremeAdapter(gridInstance, { keyExpr });
    ctrlk.connectGrid(adapter);
  }

  registerCommand(def: {
    id: string;
    title: string;
    shortcut?: string;
    category?: string;
    execute: () => void;
  }): () => void {
    return ctrlk.commands.register(def);
  }

  get commands() { return ctrlk.commands; }
  get views() { return ctrlk.views; }
  get fields() { return ctrlk.fields; }
  get density() { return ctrlk.density; }
}
```

### 2. Palette Component — `command-palette.component.ts`

Uses your existing DevExtreme popup. No inline styles. Matches your theme automatically.

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CtrlkRuntimeService, PaletteRequest } from './ctrlk-runtime.service';

@Component({
  selector: 'app-command-palette',
  template: `
    <dx-popup
      [visible]="visible"
      [width]="540"
      [maxHeight]="440"
      [showTitle]="false"
      [shading]="true"
      [closeOnOutsideClick]="true"
      (onHidden)="visible = false">

      <dx-text-box
        placeholder="Type a command..."
        [value]="query"
        (onValueChanged)="onSearch($event)"
        (onKeyDown)="onKeyDown($event)">
      </dx-text-box>

      <dx-list
        [dataSource]="results"
        [grouped]="true"
        [focusStateEnabled]="true"
        (onItemClick)="onSelect($event)">
        <div *dxTemplate="let item of 'item'">
          <div class="palette-item">
            <span class="palette-title">{{ item.title }}</span>
            <span class="palette-shortcut" *ngIf="item.shortcut">{{ item.shortcut }}</span>
          </div>
        </div>
      </dx-list>

    </dx-popup>
  `,
  styles: [`
    .palette-item { display: flex; justify-content: space-between; }
    .palette-shortcut { font-size: 11px; opacity: 0.5; font-family: monospace; }
  `]
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  visible = false;
  query = '';
  results: any[] = [];
  private sub: Subscription;
  private request: PaletteRequest | null = null;

  constructor(private ctrlk: CtrlkRuntimeService) {}

  ngOnInit() {
    this.sub = this.ctrlk.paletteRequested$.subscribe((req) => {
      this.request = req;
      this.results = this.groupByCategory(req.commands);
      this.query = '';
      this.visible = true;
    });
  }

  onSearch(e: any) {
    this.query = e.value || '';
    const matches = this.request?.search(this.query) || [];
    this.results = this.groupByCategory(matches);
  }

  onSelect(e: any) {
    this.request?.execute(e.itemData.id);
    this.visible = false;
  }

  onKeyDown(e: any) {
    if (e.event.key === 'Escape') this.visible = false;
  }

  private groupByCategory(cmds: any[]) {
    const groups = new Map();
    for (const c of cmds) {
      const cat = c.category || 'General';
      if (!groups.has(cat)) groups.set(cat, { key: cat, items: [] });
      groups.get(cat).items.push(c);
    }
    return Array.from(groups.values());
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }
}
```

### 3. Grid Component — wire the adapter

```typescript
@Component({
  template: `<dx-data-grid #grid [dataSource]="deals" keyExpr="dealId" ...>`
})
export class DealsGridComponent implements AfterViewInit {
  @ViewChild('grid') grid: DxDataGridComponent;

  constructor(private ctrlk: CtrlkRuntimeService) {}

  ngAfterViewInit() {
    this.ctrlk.bridgeGrid(this.grid.instance, 'dealId');

    // Register page-specific commands
    this.ctrlk.registerCommand({
      id: 'deals.refresh',
      title: 'Refresh Deals',
      shortcut: 'Ctrl+R',
      category: 'Deals',
      execute: () => this.grid.instance.refresh(),
    });
  }
}
```

### 4. App module — add palette once

```typescript
@Component({
  selector: 'app-root',
  template: `
    <router-outlet></router-outlet>
    <app-command-palette></app-command-palette>
  `
})
export class AppComponent {}
```

That's it. **60 lines of palette component** using your existing DevExtreme popup, matching your existing theme, rendering with Angular change detection. No inline styles. No DOM manipulation.

---

## React Pattern

```tsx
import ctrlk from '@ctrlk/core';
import { useEffect, useState, useCallback } from 'react';

function useCtrlkPalette() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    return ctrlk.onPaletteRequest((req) => {
      setRequest(req);
      setOpen(true);
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  return { open, request, close };
}

// In your app — use any UI library (Radix, MUI, Headless UI, etc.)
function CommandPalette() {
  const { open, request, close } = useCtrlkPalette();
  const [query, setQuery] = useState('');
  const results = request?.search(query) || [];

  if (!open) return null;

  return (
    <Dialog open={open} onClose={close}>
      <Input value={query} onChange={e => setQuery(e.target.value)} />
      {results.map(cmd => (
        <Item key={cmd.id} onClick={() => { request.execute(cmd.id); close(); }}>
          {cmd.title}
          {cmd.shortcut && <Kbd>{cmd.shortcut}</Kbd>}
        </Item>
      ))}
    </Dialog>
  );
}
```

---

## Vue 3 Pattern

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import ctrlk from '@ctrlk/core';

const open = ref(false);
const query = ref('');
const request = ref(null);
const results = computed(() => request.value?.search(query.value) || []);

let unsub;
onMounted(() => {
  unsub = ctrlk.onPaletteRequest((req) => {
    request.value = req;
    open.value = true;
  });
});
onUnmounted(() => unsub?.());

function select(cmd) {
  request.value?.execute(cmd.id);
  open.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="palette-overlay" @click.self="open = false">
      <div class="palette">
        <input v-model="query" placeholder="Type a command..." autofocus />
        <div v-for="cmd in results" :key="cmd.id" @click="select(cmd)">
          {{ cmd.title }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

---

## Vanilla JS (Quick Start)

For apps without a framework, or for adding to legacy pages:

```html
<script src="https://unpkg.com/@ctrlk/core/dist/ctrlk.runtime.min.js"></script>
<script>
  ctrlk.init({ palette: true, density: true });

  // Listen for palette request and build your own UI
  ctrlk.onPaletteRequest(({ commands, search, execute }) => {
    // Show your own modal/dialog
    const query = prompt('Command:');
    if (query) {
      const results = search(query);
      if (results.length) execute(results[0].id);
    }
  });
</script>
```

---

## Event Reference

| Event | Fired When | Payload |
|-------|-----------|---------|
| `palette:requested` | Ctrl+K pressed | `{ commands, search(q), execute(id) }` |
| `field-jump:requested` | Ctrl+G pressed | `{ fields, search(q), focus(id) }` |
| `shortcuts:requested` | Ctrl+/ pressed | `{ shortcuts }` |
| `density:changed` | Density cycles | `{ level, previous }` |
| `view:saved` | View saved | `{ name, slot, shortcut, remaining }` |
| `view:loaded` | View loaded | `{ name }` |
| `command:executed` | Any command runs | `{ id, result }` |
| `ctrlk:initialized` | Engine starts | `{ version, options }` |
| `ctrlk:grid-connected` | Grid adapter wired | `{ adapter }` |

Every event hook returns an **unsubscribe function**:

```typescript
const unsub = ctrlk.onPaletteRequest(handler);
// Later:
unsub(); // stops listening
```

---

## What This Means for Enterprise Teams

| Before (v1) | After (v2) |
|-------------|-----------|
| CtrlK injects its own DOM | CtrlK emits events, you render |
| Inline styles override your theme | Your CSS, your components |
| 150 lines of createElement per overlay | 60 lines using your existing popup component |
| Framework-agnostic (but framework-hostile) | Framework-native integration |
| One fixed dark palette UI | Matches whatever design system you use |
| Debug = inspect injected DOM | Debug = inspect your own component tree |

The engine is the same — commands, shortcuts, views, fields, adapters. The difference is who renders the UI.
