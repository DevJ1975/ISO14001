import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { CapaIntent, CapaRootCauseMethod, CorrectiveActionDraft, capaIntentLabel, capaRootCauseMethodLabel } from '../../core/domain';
import { CapaStatus, FieldCapa, FieldFinding, FieldAuditStore, FindingType, NcStatus } from '../../core/field/field-audit-store';
import { ToastService } from '../../core/ui/toast.service';

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
  private readonly toast = inject(ToastService);

  protected readonly isLead = computed(() => this.auth.user()?.role === 'leadAuditor');
  /** Lead & auditor may draft a finding with AI assistance (mirrors the report draft gate). */
  protected readonly canDraft = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'leadAuditor' || role === 'auditor';
  });
  /** IDs of findings whose draft is currently generating, for the button's busy state. */
  protected readonly drafting = signal<ReadonlySet<string>>(new Set());
  /** IDs of findings whose corrective-action suggestion is currently generating, for the button's busy state. */
  protected readonly suggesting = signal<ReadonlySet<string>>(new Set());
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

  /** ISO 45001 cl. 10.2 action intents (correction vs corrective vs preventive). */
  protected readonly intents: { value: CapaIntent; label: string }[] = [
    { value: 'correction', label: capaIntentLabel('correction') },
    { value: 'correctiveAction', label: capaIntentLabel('correctiveAction') },
    { value: 'preventiveAction', label: capaIntentLabel('preventiveAction') },
  ];

  /** Root-cause analysis methods offered when driving the corrective action. */
  protected readonly rootCauseMethods: { value: CapaRootCauseMethod; label: string }[] = [
    { value: 'fiveWhys', label: capaRootCauseMethodLabel('fiveWhys') },
    { value: 'fishbone', label: capaRootCauseMethodLabel('fishbone') },
    { value: 'faultTree', label: capaRootCauseMethodLabel('faultTree') },
    { value: 'other', label: capaRootCauseMethodLabel('other') },
  ];

  protected intentLabel(intent: CapaIntent | undefined): string {
    return capaIntentLabel(intent);
  }

  protected select(id: string): void {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected grade(finding: FieldFinding, grade: FindingType, rationale: string, systemic: boolean): void {
    this.store.gradeFinding(finding.id, grade, rationale.trim(), systemic);
    this.toast.saved('Finding graded');
  }

  protected saveStatement(finding: FieldFinding, statement: string): void {
    const next = statement.trim();
    if (next === (finding.description ?? '')) return;
    this.store.editFinding(finding.id, { description: next });
    this.toast.saved('Finding updated');
  }

  /** Auto-draft this finding (statement, requirement, evidence, grade) — AI when live, deterministic offline. */
  protected async draftFinding(finding: FieldFinding): Promise<void> {
    if (this.drafting().has(finding.id)) return;
    this.drafting.update((set) => new Set(set).add(finding.id));
    try {
      await this.store.generateFindingDraft(finding.id);
    } finally {
      this.drafting.update((set) => {
        const next = new Set(set);
        next.delete(finding.id);
        return next;
      });
    }
  }

  protected isDrafting(id: string): boolean {
    return this.drafting().has(id);
  }

  protected draftInfo(id: string): { source: 'ai' | 'ruleBased'; generatedAt: string } | null {
    return this.store.findingDraftInfo()[id] ?? null;
  }

  /** Suggest a root-cause analysis + draft corrective-action plan for this finding — AI when live, deterministic offline. */
  protected async suggestCorrectiveAction(finding: FieldFinding): Promise<void> {
    if (this.suggesting().has(finding.id)) return;
    this.suggesting.update((set) => new Set(set).add(finding.id));
    try {
      await this.store.generateCorrectiveAction(finding.id);
    } finally {
      this.suggesting.update((set) => {
        const next = new Set(set);
        next.delete(finding.id);
        return next;
      });
    }
  }

  protected isSuggesting(id: string): boolean {
    return this.suggesting().has(id);
  }

  protected correctiveAction(id: string): CorrectiveActionDraft | null {
    return this.store.correctiveActionDrafts()[id] ?? null;
  }

  protected correctiveActionInfo(id: string): { source: 'ai' | 'ruleBased'; generatedAt: string } | null {
    return this.store.correctiveActionInfo()[id] ?? null;
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected saveObjectiveEvidence(finding: FieldFinding, text: string): void {
    const next = text.trim();
    if (next === (finding.objectiveEvidence ?? '')) return;
    this.store.editFinding(finding.id, { objectiveEvidence: next });
    this.toast.saved('Finding updated');
  }

  protected startCapa(finding: FieldFinding): void {
    this.store.startCapa(finding.id);
  }

  protected saveCapaField(capa: FieldCapa, field: 'correction' | 'rootCause' | 'action' | 'owner' | 'dueDate', value: string): void {
    const next = value.trim();
    if (next === ((capa[field] as string | undefined) ?? '')) return;
    this.store.updateCapa(capa.id, { [field]: next || undefined });
    this.toast.saved('Action plan saved');
  }

  protected saveIntent(capa: FieldCapa, value: string): void {
    this.store.updateCapa(capa.id, { intent: value as CapaIntent });
  }

  protected saveRootCauseMethod(capa: FieldCapa, value: string): void {
    this.store.updateCapa(capa.id, { rootCauseMethod: (value || undefined) as CapaRootCauseMethod | undefined });
  }

  protected markImplemented(capa: FieldCapa): void {
    this.store.updateCapa(capa.id, { implementationEvidenceIds: ['implementation-recorded'] });
    this.toast.saved('Marked implemented');
  }

  protected async verify(capa: FieldCapa, effective: boolean, verification: string): Promise<void> {
    await this.store.verifyCapa(capa.id, { verification: verification.trim() || 'Effectiveness reviewed.', effective });
    this.toast.saved('Verification recorded');
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
