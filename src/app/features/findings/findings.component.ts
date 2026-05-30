import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { CapaStatus, FieldCapa, FieldFinding, FieldAuditStore, FindingType, NcStatus } from '../../core/field/field-audit-store';

type Tone = 'positive' | 'progress' | 'critical' | 'neutral';

@Component({
  selector: 'app-findings',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './findings.component.html',
  styleUrl: './findings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FindingsComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);

  protected readonly isLead = computed(() => this.auth.user()?.role === 'leadAuditor');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.store.findings().find((f) => f.id === this.selectedId()) ?? null);
  protected readonly selectedCapa = computed<FieldCapa | null>(() => {
    const finding = this.selected();
    return finding ? this.store.capas().find((c) => c.findingId === finding.id) ?? null : null;
  });

  protected readonly grades: { value: FindingType; label: string }[] = [
    { value: 'minorNc', label: 'Minor NC' },
    { value: 'majorNc', label: 'Major NC' },
    { value: 'ofi', label: 'OFI' },
    { value: 'conformity', label: 'Conformity' },
  ];

  protected select(id: string): void {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected grade(finding: FieldFinding, grade: FindingType, rationale: string, systemic: boolean): void {
    this.store.gradeFinding(finding.id, grade, rationale.trim(), systemic);
  }

  protected saveStatement(finding: FieldFinding, statement: string): void {
    this.store.editFinding(finding.id, { description: statement.trim() });
  }

  protected saveObjectiveEvidence(finding: FieldFinding, text: string): void {
    this.store.editFinding(finding.id, { objectiveEvidence: text.trim() });
  }

  protected startCapa(finding: FieldFinding): void {
    this.store.startCapa(finding.id);
  }

  protected saveCapaField(capa: FieldCapa, field: 'correction' | 'rootCause' | 'action' | 'owner' | 'dueDate', value: string): void {
    this.store.updateCapa(capa.id, { [field]: value.trim() || undefined });
  }

  protected markImplemented(capa: FieldCapa): void {
    this.store.updateCapa(capa.id, { implementationEvidenceIds: ['implementation-recorded'] });
  }

  protected async verify(capa: FieldCapa, effective: boolean, verification: string): Promise<void> {
    await this.store.verifyCapa(capa.id, { verification: verification.trim() || 'Effectiveness reviewed.', effective });
  }

  protected typeLabel(type: FindingType): string {
    return { majorNc: 'Major NC', minorNc: 'Minor NC', ofi: 'OFI', conformity: 'Conformity' }[type];
  }

  protected typeTone(type: FindingType): Tone {
    if (type === 'majorNc') return 'critical';
    if (type === 'minorNc') return 'progress';
    if (type === 'conformity') return 'positive';
    return 'neutral';
  }

  protected statusTone(status: NcStatus): Tone {
    if (status === 'closed' || status === 'verified') return 'positive';
    if (status === 'rejected' || status === 'reopened') return 'critical';
    return 'progress';
  }

  protected capaTone(status: CapaStatus): Tone {
    if (status === 'verified') return 'positive';
    if (status === 'overdue') return 'critical';
    if (status === 'open') return 'neutral';
    return 'progress';
  }

  protected overdue(capa: FieldCapa | null): boolean {
    return !!capa?.dueDate && capa.status !== 'verified' && new Date(capa.dueDate).getTime() < Date.now();
  }
}
