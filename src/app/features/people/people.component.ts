import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore } from '../../core/field/field-audit-store';
import { ConfirmService } from '../../core/ui/confirm.service';

type Tab = 'workers' | 'sites';

/**
 * People & Sites master — tenant/audit-scoped lists of workers/persons and
 * sites/locations. Lets competence, training and consultation reference people
 * consistently (rather than by free-text name) and supports multi-site sampling.
 */
@Component({
  selector: 'app-people',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './people.component.html',
  styleUrl: './people.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly confirm = inject(ConfirmService);
  protected readonly tab = signal<Tab>('workers');

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected async removeWorker(id: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove worker',
      message: `Remove ${name || 'this person'} from the master list?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeWorker(id);
  }

  protected async removeSite(id: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove site',
      message: `Remove ${name || 'this site'} from the master list?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeSite(id);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
