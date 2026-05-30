import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { sharedClauseTitles } from '@domain/standards';
import { createNoteEvidenceFromCapture } from '@domain/field-execution';
import { markAiDraftReviewed } from '@domain/ai-copilot';
import { signAuditReport } from '@domain/reports-capa';
import { isPilotReady, summarizeHardeningControls } from '@domain/hardening';
import { hasRequiredCallableCoverage, isPhaseSixProductionReady } from '@domain/production-backend';

import { MONGODB_API_BACKEND } from '../../core/backend/mongodb-api';
import {
  demoAuditSetup,
  demoAuditees,
  demoChecklistTemplate,
  demoMembers,
  demoTenantId,
} from './phase-one-demo';
import {
  demoAuditId,
  demoChecklistExecutionItems,
  demoConflict,
  demoEvidence,
  demoFindings,
  demoSyncQueue,
  displayNameForMember,
} from './phase-two-demo';
import {
  demoAiFindingDraft,
  demoEmsAnswer,
  demoKnowledgeDocs,
  demoLineOfInquiry,
  demoPhotoAiAnalysis,
  demoRagResult,
  demoTransitionGap,
} from './phase-three-demo';
import {
  demoCapaReminders,
  demoCorrectiveActions,
  demoReportDraft,
  demoReportSignoff,
  demoTransitionGapReport,
} from './phase-four-demo';
import {
  demoAccessibilityChecks,
  demoHardeningControls,
  demoObservabilityEvents,
  demoPilotChecklist,
  demoSecurityProbes,
} from './phase-five-demo';
import {
  demoBackendJobs,
  demoCallableFunctionContracts,
  demoEvidenceUploadIntent,
  demoMongoCollections,
  demoPhaseSixReadiness,
} from './phase-six-demo';

const phaseCards = [
  {
    title: 'Tenant foundation',
    status: 'Ready for emulator tests',
    body: 'Custom claims, member roles, tenant-scoped paths, and server-only platform operations are modeled.',
  },
  {
    title: 'Audit execution',
    status: 'Contracts drafted',
    body: 'Audits, evidence, findings, CAPA, reports, and assigned member teams have strict schemas.',
  },
  {
    title: 'Offline sync',
    status: 'Policy selected',
    body: 'Section ownership reduces collisions; per-document last-write-wins is paired with change logging.',
  },
  {
    title: 'AI copilot',
    status: 'Guardrails defined',
    body: 'RAG will be tenant and auditee namespaced, with auditor confirmation before records are finalized.',
  },
  {
    title: 'Photo evidence',
    status: 'Camera path added',
    body: 'Auditors can capture site photos and send tenant-scoped copies for AI image identification.',
  },
  {
    title: 'Pilot hardening',
    status: 'Soteria theme',
    body: 'Security probes, accessibility checks, observability, and pilot readiness are now tracked.',
  },
  {
    title: 'MongoDB backend',
    status: 'Phase 6 started',
    body: 'A Node API owns MongoDB writes, tenant checks, upload intents, AI jobs, and report jobs.',
  },
];

const wikiManuals = [
  {
    title: 'Auditor Implementation Manual',
    href: '/docs/wiki/auditor-implementation-manual.md',
    body: 'Tenant setup, member roles, audit configuration, photo evidence, AI review, and go-live checks.',
  },
  {
    title: 'Auditor Training Manual',
    href: '/docs/wiki/auditor-training-manual.md',
    body: 'Planning, field evidence capture, picture evidence, AI image identification, findings, CAPA, and reporting.',
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatSidenavModule, MatToolbarModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly mongoBackend = inject(MONGODB_API_BACKEND);

  protected readonly selectedEdition = signal<'ISO_14001_2026' | 'ISO_14001_2015'>('ISO_14001_2026');
  protected readonly capturedPhotoName = signal<string | null>(null);
  protected readonly apiBackend = this.mongoBackend;
  protected readonly phaseCards = phaseCards;
  protected readonly wikiManuals = wikiManuals;
  protected readonly auditees = demoAuditees;
  protected readonly checklistTemplate = demoChecklistTemplate;
  protected readonly auditSetup = demoAuditSetup;
  protected readonly assignedTeam = demoMembers.filter((member) => demoAuditSetup.assignedMembers.includes(member.uid));
  protected readonly leadAuditor = demoMembers.find((member) => member.uid === demoAuditSetup.leadAuditor);
  protected readonly selectedAuditee = demoAuditees.find((auditee) => auditee.id === demoAuditSetup.auditeeId);
  protected readonly sectionAssignments = Object.entries(demoAuditSetup.sectionOwners).map(([clauseId, uid]) => ({
    clauseId,
    auditorName: demoMembers.find((member) => member.uid === uid)?.profile.displayName ?? 'Unassigned',
  }));
  protected readonly checklistExecutionItems = demoChecklistExecutionItems;
  protected readonly findings = demoFindings;
  protected readonly conflict = demoConflict;
  protected readonly conflictLocalAuditorName = displayNameForMember(demoConflict.localChangedBy);
  protected readonly conflictRemoteAuditorName = displayNameForMember(demoConflict.remoteChangedBy);
  protected readonly evidenceRecords = signal([...demoEvidence]);
  protected readonly syncQueue = signal([...demoSyncQueue]);
  protected readonly knowledgeDocs = demoKnowledgeDocs;
  protected readonly ragResult = demoRagResult;
  protected readonly emsAnswer = demoEmsAnswer;
  protected readonly aiFindingDrafts = signal([demoAiFindingDraft]);
  protected readonly lineOfInquiry = demoLineOfInquiry;
  protected readonly transitionGap = demoTransitionGap;
  protected readonly photoAiAnalysis = demoPhotoAiAnalysis;
  protected readonly report = signal(demoReportDraft);
  protected readonly correctiveActions = signal([...demoCorrectiveActions]);
  protected readonly capaReminders = demoCapaReminders;
  protected readonly transitionGapReport = demoTransitionGapReport;
  protected readonly hardeningControls = demoHardeningControls;
  protected readonly securityProbes = demoSecurityProbes;
  protected readonly accessibilityChecks = demoAccessibilityChecks;
  protected readonly observabilityEvents = demoObservabilityEvents;
  protected readonly pilotChecklist = demoPilotChecklist;
  protected readonly hardeningSummary = summarizeHardeningControls(demoHardeningControls);
  protected readonly mongoCollections = demoMongoCollections;
  protected readonly callableFunctionContracts = demoCallableFunctionContracts;
  protected readonly evidenceUploadIntent = demoEvidenceUploadIntent;
  protected readonly backendJobs = signal([...demoBackendJobs]);
  protected readonly phaseSixReadiness = demoPhaseSixReadiness;

  protected readonly clauses = computed(() => {
    return sharedClauseTitles.find((edition) => edition.id === this.selectedEdition())?.clauses ?? [];
  });

  protected readonly phaseOneSummary = computed(() => {
    return [
      { label: 'Auditees', value: this.auditees.length.toString() },
      { label: 'Template items', value: this.checklistTemplate.items.length.toString() },
      { label: 'Assigned auditors', value: this.assignedTeam.length.toString() },
    ];
  });

  protected readonly phaseTwoSummary = computed(() => {
    return [
      { label: 'Checklist rows', value: this.checklistExecutionItems.length.toString() },
      { label: 'Evidence records', value: this.evidenceRecords().length.toString() },
      { label: 'Draft findings', value: this.findings.length.toString() },
      { label: 'Sync queue', value: this.syncQueue().length.toString() },
    ];
  });

  protected readonly phaseThreeSummary = computed(() => {
    const reviewItems =
      this.aiFindingDrafts().filter((draft) => draft.status === 'needsAuditorReview').length +
      this.lineOfInquiry.filter((prompt) => prompt.status === 'needsAuditorReview').length +
      (this.transitionGap.status === 'needsAuditorReview' ? 1 : 0) +
      (this.photoAiAnalysis.status === 'needsAuditorReview' ? 1 : 0);

    return [
      { label: 'EMS docs', value: this.knowledgeDocs.length.toString() },
      { label: 'Citations', value: this.ragResult.citations.length.toString() },
      { label: 'Review queue', value: reviewItems.toString() },
      { label: 'Accepted drafts', value: this.aiFindingDrafts().filter((draft) => draft.status === 'accepted').length.toString() },
    ];
  });

  protected readonly phaseFourSummary = computed(() => {
    return [
      { label: 'Report status', value: this.report().status },
      { label: 'CAPA open', value: this.correctiveActions().filter((capa) => capa.status !== 'verified').length.toString() },
      { label: 'Reminders', value: this.capaReminders.length.toString() },
      { label: 'Gap refs', value: this.transitionGapReport.gapCandidateRefs.length.toString() },
    ];
  });

  protected readonly phaseFiveSummary = computed(() => {
    return [
      { label: 'Controls', value: this.hardeningControls.length.toString() },
      { label: 'Security probes', value: this.securityProbes.length.toString() },
      { label: 'Pilot ready', value: isPilotReady(this.pilotChecklist) ? 'yes' : 'not yet' },
      { label: 'Telemetry events', value: this.observabilityEvents.length.toString() },
    ];
  });

  protected readonly phaseSixSummary = computed(() => {
    return [
      { label: 'Mongo collections', value: this.mongoCollections.length.toString() },
      {
        label: 'API contracts',
        value: hasRequiredCallableCoverage(this.callableFunctionContracts)
          ? this.callableFunctionContracts.length.toString()
          : 'gap',
      },
      { label: 'Backend jobs', value: this.backendJobs().length.toString() },
      { label: 'Production ready', value: isPhaseSixProductionReady(this.phaseSixReadiness) ? 'yes' : 'not yet' },
    ];
  });

  protected setEdition(edition: 'ISO_14001_2026' | 'ISO_14001_2015'): void {
    this.selectedEdition.set(edition);
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    this.capturedPhotoName.set(file?.name ?? null);
  }

  protected captureDemoFieldNote(): void {
    const count = this.evidenceRecords().length + 1;
    const now = new Date().toISOString();
    const checklistItem = demoChecklistTemplate.items[2]!;
    const evidenceId = `evidence-note-${count}`;
    const evidence = createNoteEvidenceFromCapture(
      {
        tenantId: demoTenantId,
        auditId: demoAuditId,
        checklistItemId: `audit-${checklistItem.id}`,
        clauseRef: checklistItem.clauseRef,
        note: 'Observed operational control walkthrough note captured offline for later auditor review.',
        capturedBy: 'uid-ava-auditor',
        capturedAt: now,
        captureSource: 'offline',
        offlineLocalId: `local-note-${count}`,
      },
      evidenceId,
    );

    this.evidenceRecords.update((records) => [...records, evidence]);
    this.syncQueue.update((items) => [
      ...items,
      {
        id: `sync-${evidenceId}`,
        tenantId: demoTenantId,
        auditId: demoAuditId,
        collectionPath: `/tenants/${demoTenantId}/audits/${demoAuditId}/evidence`,
        documentId: evidenceId,
        operation: 'create',
        queuedBy: 'uid-ava-auditor',
        queuedAt: now,
        captureSource: 'offline',
        status: 'pending',
        retryCount: 0,
      },
    ]);
  }

  protected markDemoQueueSynced(): void {
    this.syncQueue.set([]);
  }

  protected acceptDemoAiFindingDraft(): void {
    const now = new Date().toISOString();
    this.aiFindingDrafts.update((drafts) =>
      drafts.map((draft, index) =>
        index === 0 && draft.status !== 'accepted'
          ? markAiDraftReviewed(draft, 'accepted', 'uid-maya-lead', now)
          : draft,
      ),
    );
  }

  protected signDemoReport(): void {
    if (this.report().status === 'signed') {
      return;
    }

    this.report.set(signAuditReport(this.report(), demoReportSignoff));
  }

  protected verifyFirstCapa(): void {
    this.correctiveActions.update((items) =>
      items.map((item, index) =>
        index === 0
          ? {
              ...item,
              status: 'verified',
              verification: 'Verified in demo workflow with lead-auditor review.',
              verificationEvidenceRefs: [...item.verificationEvidenceRefs, 'report-transition-1'],
            }
          : item,
      ),
    );
  }

  protected queueDemoPhotoAnalysisJob(): void {
    const count = this.backendJobs().length + 1;
    const now = new Date().toISOString();
    this.backendJobs.update((jobs) => [
      ...jobs,
      {
        id: `job-photo-ai-demo-${count}`,
        tenantId: demoTenantId,
        auditId: demoAuditId,
        callableName: 'requestPhotoAnalysis',
        requestedByUid: 'uid-ava-auditor',
        status: 'queued',
        idempotencyKey: `phase-six-photo-ai-demo-${count}`,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
        resultRef: `/tenants/${demoTenantId}/audits/${demoAuditId}/photoAnalyses/${this.evidenceUploadIntent.evidenceId}`,
      },
    ]);
  }
}
