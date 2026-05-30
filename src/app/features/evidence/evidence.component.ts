import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore, type FieldEvidence, SyncState } from '../../core/field/field-audit-store';

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

  /** Signed URLs resolved on demand for photos with no local thumbnail. */
  private readonly resolved = signal<Record<string, string>>({});

  protected onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      void this.store.addPhotoEvidence(file, {});
    }
    input.value = '';
  }

  /** Photo URL to render: the local thumb, or a lazily-resolved signed URL. */
  protected photoUrl(evidence: FieldEvidence): string | null {
    if (evidence.thumbUrl) return evidence.thumbUrl;
    const cached = this.resolved()[evidence.id];
    if (cached) return cached;
    if (evidence.kind === 'photo' && evidence.uploaded) {
      void this.store.resolvePhotoUrl(evidence.id).then((url) => {
        if (url) this.resolved.update((map) => ({ ...map, [evidence.id]: url }));
      });
    }
    return null;
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
