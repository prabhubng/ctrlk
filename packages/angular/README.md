# @ctrlk/angular

Angular service and directives for [CtrlK](https://ctrlk.dev) — the first IOUX for enterprise web apps.

## Install

```bash
npm i @ctrlk/core @ctrlk/angular
```

## Setup

```typescript
import { CtrlkModule } from '@ctrlk/angular';

@NgModule({
  imports: [CtrlkModule.forRoot()],
})
export class AppModule {}
```

## Directives

| Directive | Description |
|-----------|-------------|
| `[ctrlkCommand]` | Register a command from a template element. |
| `[ctrlkField]` | Register a form field for jump-to navigation. |
| `[ctrlkShortcut]` | Bind a shortcut to a component method. |
| `[ctrlkZone]` | Define a focus navigation zone. |

## Example

```html
<button
  ctrlkCommand="export.csv"
  ctrlkCommandTitle="Export to CSV"
  ctrlkCommandShortcut="Ctrl+Shift+E"
  (click)="exportCsv()">
  Export
</button>

<input
  ctrlkField="patient.name"
  ctrlkFieldLabel="Patient Name"
  ctrlkFieldSection="Demographics"
  [(ngModel)]="patient.name" />
```

## Service

```typescript
import { CtrlkService } from '@ctrlk/angular';

@Component({ ... })
export class AppComponent {
  constructor(private ctrlk: CtrlkService) {
    this.ctrlk.register({
      id: 'navigate.deals',
      title: 'Go to Deals',
      shortcut: 'Alt+D',
      execute: () => this.router.navigate(['/deals']),
    });
  }
}
```

## License

MIT — [ctrlk.dev](https://ctrlk.dev)
