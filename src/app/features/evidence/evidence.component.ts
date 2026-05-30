import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore, SyncState } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-evidence',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './evidence.component.html',
  styleUrl: './evidence.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceComponent {
  protected readonly store = inject(FieldAuditStore);

  protected onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      void this.store.addPhotoEvidence(file, {});
    }
    input.value = '';
  }

  protected addNote(text: string): void {
    const note = text.trim();
    if (note) {
      this.store.addNoteEvidence({ text: note });
    }
  }

  protected syncTone(sync: SyncState): 'positive' | 'progress' | 'critical' {
    if (sync === 'synced') return 'positive';
    if (sync === 'conflict') return 'critical';
    return 'progress';
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
