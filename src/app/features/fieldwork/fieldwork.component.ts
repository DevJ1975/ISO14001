import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { editionFromCriteria, standardChecklist } from '../../core/domain';
import {
  FieldAuditStore,
  FieldChecklistItem,
  FieldResult,
  FindingType,
  SyncState,
} from '../../core/field/field-audit-store';
import { SpeechService, mergeTranscript } from '../../core/speech/speech.service';
import { CommandPaletteService } from '../../core/ui/command-palette.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';

type Tone = 'positive' | 'progress' | 'critical' | 'neutral';
type FilterKey = 'all' | 'open' | 'nc';

@Component({
  selector: 'app-fieldwork',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, RouterLink],
  templateUrl: './fieldwork.component.html',
  styleUrl: './fieldwork.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class FieldworkComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly palette = inject(CommandPaletteService);
  protected readonly speech = inject(SpeechService);
  protected readonly index = signal(0);
  protected readonly filter = signal<FilterKey>('all');

  /** Checklist item id currently receiving dictation, if any. */
  protected readonly dictatingId = signal<string | null>(null);

  /** Per-audit checklist authoring state. */
  protected readonly editing = signal(false);
  protected readonly showAdd = signal(false);

  /** Whether every clause on the checklist has an answer. */
  protected readonly completed = computed(() => {
    const progress = this.store.progress();
    return progress.total > 0 && progress.percent === 100;
  });

  /** Transient "all clauses answered" banner; auto-clears after a few seconds. */
  protected readonly showCelebration = signal(false);
  private primed = false;
  private wasComplete = false;

  constructor() {
    // Avoid a dangling recognition session if the user navigates away mid-dictation.
    inject(DestroyRef).onDestroy(() => this.speech.stop());

    // Celebrate only on a genuine transition to 100% — never on mount when the
    // checklist is already complete (so reopening the screen stays quiet).
    effect(() => {
      const done = this.completed();
      if (!this.primed) {
        this.primed = true;
        this.wasComplete = done;
        return;
      }
      if (done && !this.wasComplete) {
        this.showCelebration.set(true);
        this.toast.saved('Audit checklist complete');
        setTimeout(() => this.showCelebration.set(false), 3500);
      }
      this.wasComplete = done;
    });
  }

  /** Standard clauses offered when adding a custom check. */
  protected readonly clauseOptions = computed(() =>
    standardChecklist(editionFromCriteria(this.store.criteria())).map((row) => ({
      clauseId: row.clauseId,
      clauseTitle: row.clauseTitle,
    })),
  );

  /** Clauses in the selected standard not yet on the checklist (drives the "add missing" action). */
  protected readonly missingCount = computed(() => {
    const present = new Set(this.store.items().map((item) => item.clauseId));
    return standardChecklist(editionFromCriteria(this.store.criteria())).filter(
      (row) => !present.has(row.clauseId),
    ).length;
  });

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
    this.editing.set(false);
  }

  /** Pull in every ISO 45001 clause not yet on the checklist so all of them are answerable. */
  protected addMissingClauses(): void {
    this.store.addMissingClauseItems();
    this.index.set(0);
  }

  /** Top-level clause group label (e.g. "6 · Planning") for orientation while stepping clause by clause. */
  protected sectionTitle(clauseId: string): string {
    const top = clauseId.split('.')[0] ?? clauseId;
    const parent = this.store.items().find((item) => item.clauseId === top);
    return parent ? `${top} · ${parent.clauseTitle}` : `Section ${top}`;
  }

  // --- Per-audit checklist authoring ---

  protected startEdit(): void {
    this.showAdd.set(false);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected saveEdit(item: FieldChecklistItem, question: string, guidance: string): void {
    if (!question.trim()) return;
    this.store.updateChecklistItem(item.id, { question, guidance });
    this.editing.set(false);
  }

  protected toggleAdd(): void {
    this.editing.set(false);
    this.showAdd.update((value) => !value);
  }

  protected addCustom(clauseId: string, question: string, guidance: string): void {
    if (!question.trim()) return;
    const option = this.clauseOptions().find((entry) => entry.clauseId === clauseId);
    this.store.addCustomChecklistItem({ clauseId, clauseTitle: option?.clauseTitle, question, guidance });
    this.showAdd.set(false);
  }

  protected async removeCurrent(item: FieldChecklistItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove this check?',
      message: `"${item.clauseTitle}" (clause ${item.clauseId}) will be removed from this audit's checklist.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) {
      const removed = item;
      this.store.removeChecklistItem(item.id);
      this.index.set(0);
      this.toast.undo('Check removed', () => {
        this.store.restoreChecklistItem(removed);
        this.index.set(0);
      });
    }
  }

  protected choose(item: FieldChecklistItem, value: FieldResult): void {
    this.store.setResult(item.id, value);
    this.toast.saved(`${this.resultLabel(value)} recorded`);
  }

  protected saveNote(item: FieldChecklistItem, note: string): void {
    const trimmed = note.trim();
    if (trimmed === (item.note ?? '')) return;
    this.store.setNote(item.id, trimmed);
    this.toast.saved('Note saved');
  }

  /**
   * Power-user shortcuts: ← / → step between clauses, 1–5 set the decision.
   * Ignored while typing, editing wording, a dialog/palette is open, or a
   * modifier is held — so it never fights normal input or the command palette.
   */
  protected onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.editing() || this.showAdd()) return;
    if (this.confirm.pending() || this.palette.open()) return;
    if (this.isTypingTarget(event.target)) return;

    const item = this.current();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (item && /^[1-5]$/.test(event.key)) {
      const decision = this.decisions[Number(event.key) - 1];
      if (decision) {
        event.preventDefault();
        this.choose(item, decision.value);
      }
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  /** Toggle voice dictation for this clause's field note, appending finalised speech. */
  protected dictate(item: FieldChecklistItem): void {
    if (!this.speech.supported) return;

    if (this.speech.listening()) {
      this.speech.stop();
      this.dictatingId.set(null);
      return;
    }

    this.dictatingId.set(item.id);
    this.speech.start((text) => {
      const current = this.store.items().find((entry) => entry.id === item.id);
      const merged = mergeTranscript(current?.note ?? '', text);
      this.store.setNote(item.id, merged);
    });
  }

  /** True when this specific clause's mic is actively listening. */
  protected isDictating(item: FieldChecklistItem): boolean {
    return this.speech.listening() && this.dictatingId() === item.id;
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
    this.editing.set(false);
    this.index.update((value) => Math.max(0, value - 1));
  }

  protected next(): void {
    this.editing.set(false);
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
