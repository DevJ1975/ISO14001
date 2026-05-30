import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import {
  FieldAuditStore,
  FieldChecklistItem,
  FieldResult,
  FindingType,
  SyncState,
} from '../../core/field/field-audit-store';

type Tone = 'positive' | 'progress' | 'critical' | 'neutral';
type FilterKey = 'all' | 'open' | 'nc';

@Component({
  selector: 'app-fieldwork',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './fieldwork.component.html',
  styleUrl: './fieldwork.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldworkComponent {
  protected readonly store = inject(FieldAuditStore);
  protected readonly index = signal(0);
  protected readonly filter = signal<FilterKey>('all');

  protected readonly filters: { value: FilterKey; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Unanswered' },
    { value: 'nc', label: 'Non-conformities' },
  ];

  protected readonly decisions: { value: FieldResult; label: string; icon: string; tone: Tone }[] = [
    { value: 'conform', label: 'Conform', icon: 'check_circle', tone: 'positive' },
    { value: 'minorNc', label: 'Minor NC', icon: 'error', tone: 'progress' },
    { value: 'majorNc', label: 'Major NC', icon: 'cancel', tone: 'critical' },
    { value: 'ofi', label: 'OFI', icon: 'lightbulb', tone: 'neutral' },
    { value: 'na', label: 'N/A', icon: 'block', tone: 'neutral' },
  ];

  protected readonly visibleItems = computed(() => {
    const all = this.store.items();
    switch (this.filter()) {
      case 'open':
        return all.filter((item) => item.result === 'notStarted');
      case 'nc':
        return all.filter((item) => item.result === 'minorNc' || item.result === 'majorNc');
      default:
        return all;
    }
  });

  protected readonly position = computed(() => {
    const length = this.visibleItems().length;
    return length ? Math.min(this.index(), length - 1) + 1 : 0;
  });

  protected readonly current = computed<FieldChecklistItem | null>(() => {
    const list = this.visibleItems();
    return list.length ? list[Math.min(this.index(), list.length - 1)]! : null;
  });

  protected setFilter(value: FilterKey): void {
    this.filter.set(value);
    this.index.set(0);
  }

  protected choose(item: FieldChecklistItem, value: FieldResult): void {
    this.store.setResult(item.id, value);
  }

  protected saveNote(item: FieldChecklistItem, note: string): void {
    this.store.setNote(item.id, note.trim());
  }

  protected onPhoto(event: Event, item: FieldChecklistItem): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      void this.store.addPhotoEvidence(file, { itemId: item.id, clauseId: item.clauseId });
    }
    input.value = '';
  }

  protected logFinding(item: FieldChecklistItem): void {
    const type: FindingType =
      item.result === 'majorNc' ? 'majorNc' : item.result === 'minorNc' ? 'minorNc' : 'ofi';
    this.store.promoteToFinding(item.id, type, item.note?.trim() || item.question);
  }

  protected prev(): void {
    this.index.update((value) => Math.max(0, value - 1));
  }

  protected next(): void {
    this.index.update((value) => Math.min(this.visibleItems().length - 1, value + 1));
  }

  protected evidenceFor(item: FieldChecklistItem) {
    return this.store.evidence().filter((evidence) => evidence.itemId === item.id);
  }

  protected resultLabel(result: FieldResult): string {
    return (
      {
        notStarted: 'Not answered',
        conform: 'Conform',
        minorNc: 'Minor NC',
        majorNc: 'Major NC',
        ofi: 'Opportunity',
        na: 'N/A',
      } satisfies Record<FieldResult, string>
    )[result];
  }

  protected resultTone(result: FieldResult): Tone {
    if (result === 'conform') return 'positive';
    if (result === 'minorNc') return 'progress';
    if (result === 'majorNc') return 'critical';
    return 'neutral';
  }

  protected syncTone(sync: SyncState): Tone {
    if (sync === 'synced') return 'positive';
    if (sync === 'conflict') return 'critical';
    return 'progress';
  }

  protected canLogFinding(item: FieldChecklistItem): boolean {
    return item.result === 'minorNc' || item.result === 'majorNc' || item.result === 'ofi';
  }
}
