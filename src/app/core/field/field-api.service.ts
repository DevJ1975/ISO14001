import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import type { AuditAgenda, AuditAgendaInput, ClauseAnswer, FindingDraft, FindingDraftInput, MeetingScripts, PhotoAnalysisFindingType, ReportDraft, ReportDraftInput } from '../domain';
import { AuditSelectionService } from './audit-selection.service';
import type {
  AuditConclusion,
  AuditMeeting,
  AuditStatus,
  AuditSummary,
  AwarenessRecord,
  CalibrationRecord,
  ChangeLogEntry,
  ReportMeta,
  CommunicationRecord,
  CompetenceRecord,
  ComplianceObligation,
  DocumentedInfoRecord,
  EmergencyRecord,
  Hazard,
  HiraEntry,
  Incident,
  OhsObjective,
  FieldCapa,
  FieldChecklistItem,
  FieldEvidence,
  FieldEvidenceRequest,
  FieldFinding,
  FieldResult,
  ContextItem,
  InterestedParty,
  LeadershipItem,
  ManagementOfChangeRecord,
  ManagementReviewRecord,
  OperationalControl,
  PerformanceMetric,
  Permit,
  ResourceRecord,
  RiskOpportunity,
  Site,
  SupplierRecord,
  TrainingRecord,
  Worker,
  WorkerConsultation,
} from './field-audit-store';

export interface Member {
  uid: string;
  email: string;
  role: string;
  displayName: string;
  status: string;
}

export interface FieldStatePayload {
  audit?: AuditSummary | null;
  items: Array<Omit<FieldChecklistItem, 'sync'>>;
  evidence: Array<Omit<FieldEvidence, 'sync' | 'thumbUrl'>>;
  evidenceRequests?: Array<Omit<FieldEvidenceRequest, 'sync'>>;
  findings: Array<Omit<FieldFinding, 'sync'>>;
  capas?: Array<Omit<FieldCapa, 'sync'>>;
  auditStatus?: AuditStatus;
  meetings?: Array<Omit<AuditMeeting, 'sync'>>;
  conclusion?: Omit<AuditConclusion, 'sync'> | null;
  aspects?: Array<Omit<Hazard, 'sync'>>;
  obligations?: Array<Omit<ComplianceObligation, 'sync'>>;
  emergencyRecords?: Array<Omit<EmergencyRecord, 'sync'>>;
  interestedParties?: Array<Omit<InterestedParty, 'sync'>>;
  objectives?: Array<Omit<OhsObjective, 'sync'>>;
  communications?: Array<Omit<CommunicationRecord, 'sync'>>;
  managementReviews?: Array<Omit<ManagementReviewRecord, 'sync'>>;
  workerConsultations?: Array<Omit<WorkerConsultation, 'sync'>>;
  risksOpportunities?: Array<Omit<RiskOpportunity, 'sync'>>;
  resources?: Array<Omit<ResourceRecord, 'sync'>>;
  competence?: Array<Omit<CompetenceRecord, 'sync'>>;
  workers?: Array<Omit<Worker, 'sync'>>;
  sites?: Array<Omit<Site, 'sync'>>;
  awareness?: Array<Omit<AwarenessRecord, 'sync'>>;
  documentedInfo?: Array<Omit<DocumentedInfoRecord, 'sync'>>;
  performanceMetrics?: Array<Omit<PerformanceMetric, 'sync'>>;
  permits?: Array<Omit<Permit, 'sync'>>;
  incidents?: Array<Omit<Incident, 'sync'>>;
  hira?: Array<Omit<HiraEntry, 'sync'>>;
  calibration?: Array<Omit<CalibrationRecord, 'sync'>>;
  training?: Array<Omit<TrainingRecord, 'sync'>>;
  suppliers?: Array<Omit<SupplierRecord, 'sync'>>;
  changes?: Array<Omit<ManagementOfChangeRecord, 'sync'>>;
  operationalControls?: Array<Omit<OperationalControl, 'sync'>>;
  leadership?: Array<Omit<LeadershipItem, 'sync'>>;
  context?: Array<Omit<ContextItem, 'sync'>>;
  reportMeta?: Omit<ReportMeta, 'sync'> | null;
  changeLog?: ChangeLogEntry[];
}

/** Raw shape the photo-analyze route returns: a review-ready candidate with a
 *  `needsAuditorReview` status. Strings are normalized client-side before use. */
export interface PhotoAnalysisApiResponse {
  status: 'needsAuditorReview';
  observations?: string[];
  hazardTags?: string[];
  suggestedClauseId?: string;
  suggestedFindingStatement?: string;
  suggestedType?: PhotoAnalysisFindingType;
  provider?: string;
  generatedAt?: string;
}

/** Thin client over the tenant-scoped field-audit endpoints. The bearer token is
 *  attached by the auth interceptor; the tenant comes from the signed-in user. */
@Injectable({ providedIn: 'root' })
export class FieldApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);
  private readonly selection = inject(AuditSelectionService);

  async listAudits(): Promise<AuditSummary[]> {
    const result = await firstValueFrom(this.http.get<{ audits: AuditSummary[] }>(`${this.tenantBase()}/audits`));
    return result?.audits ?? [];
  }

  async listMembers(): Promise<Member[]> {
    const result = await firstValueFrom(this.http.get<{ members: Member[] }>(`${this.tenantBase()}/members`));
    return result?.members ?? [];
  }

  createMember(body: { email: string; displayName: string; role: string }): Promise<{ member: Member; setPasswordLink?: string }> {
    return firstValueFrom(this.http.post<{ member: Member; setPasswordLink?: string }>(`${this.tenantBase()}/members`, body));
  }

  updateMember(uid: string, patch: { role?: string; status?: string; displayName?: string }): Promise<{ member: Member }> {
    return firstValueFrom(this.http.put<{ member: Member }>(`${this.tenantBase()}/members/${encodeURIComponent(uid)}`, patch));
  }

  resetMemberPassword(uid: string): Promise<{ setPasswordLink?: string }> {
    return firstValueFrom(this.http.post<{ setPasswordLink?: string }>(`${this.tenantBase()}/members/${encodeURIComponent(uid)}/password`, {}));
  }

  changeOwnPassword(currentPassword: string, newPassword: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.config.apiBaseUrl}/auth/change-password`, { currentPassword, newPassword }));
  }

  createAudit(body: { auditee: string; scope: string; criteria: string }): Promise<AuditSummary> {
    return firstValueFrom(
      this.http.post<{ audit: AuditSummary }>(`${this.tenantBase()}/audits`, body),
    ).then((r) => r.audit);
  }

  async health(): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.get<{ ok: boolean }>(`${this.config.apiBaseUrl}/health`));
      return result?.ok === true;
    } catch {
      return false;
    }
  }

  getFieldState(): Promise<FieldStatePayload> {
    return firstValueFrom(this.http.get<FieldStatePayload>(`${this.base()}/field-state`));
  }

  putChecklistResult(itemId: string, body: { result: FieldResult; note?: string }): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/checklist/${encodeURIComponent(itemId)}`, body));
  }

  createEvidence(body: Omit<FieldEvidence, 'sync' | 'thumbUrl' | 'blobKey'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/evidence`, body));
  }

  /** Downscale the photo, then POST the bytes through the function to Storage. */
  async uploadEvidencePhoto(evidenceId: string, file: Blob): Promise<boolean> {
    try {
      const image = await downscaleImage(file);
      await firstValueFrom(
        this.http.post(`${this.base()}/evidence/${encodeURIComponent(evidenceId)}/photo`, image, {
          headers: { 'content-type': image.type || 'image/jpeg' },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Short-lived signed URL to view an uploaded photo (private bucket). */
  async evidenceViewUrl(evidenceId: string): Promise<string | null> {
    try {
      const { url } = await firstValueFrom(
        this.http.get<{ url: string }>(`${this.base()}/evidence/${encodeURIComponent(evidenceId)}/view-url`),
      );
      return url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Request server-side AI (vision) analysis of a captured photo. Returns a
   * review-ready candidate (observations / hazard tags / suggested clause +
   * finding). Rejects with a 501 when the model/key are unconfigured so the
   * store can show the graceful "needs the server/key" state, mirroring
   * draftReport(). The route looks up the stored evidence image server-side, so
   * no body is required.
   */
  requestPhotoAnalysis(evidenceId: string): Promise<PhotoAnalysisApiResponse> {
    return firstValueFrom(
      this.http.post<PhotoAnalysisApiResponse>(
        `${this.base()}/evidence/${encodeURIComponent(evidenceId)}/analyze`,
        {},
      ),
    );
  }

  upsertFinding(body: Omit<FieldFinding, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/findings/${encodeURIComponent(body.id)}`, body));
  }

  upsertEvidenceRequest(body: Omit<FieldEvidenceRequest, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/evidence-requests/${encodeURIComponent(body.id)}`, body));
  }

  upsertCapa(body: Omit<FieldCapa, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/capa/${encodeURIComponent(body.id)}`, body));
  }

  verifyCapa(
    id: string,
    body: { findingId: string; verification: string; effective: boolean; verificationEvidenceIds: string[] },
  ): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/capa/${encodeURIComponent(id)}/verify`, body));
  }

  setAuditStatus(status: AuditStatus): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/status`, { status }));
  }

  upsertMeeting(body: Omit<AuditMeeting, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/meetings/${encodeURIComponent(body.id)}`, body));
  }

  saveConclusion(body: Omit<AuditConclusion, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/conclusion`, body));
  }

  saveReportMeta(body: Omit<ReportMeta, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/report-meta`, body));
  }

  /** Generate a first-draft report narrative server-side (AI). Rejects when unavailable so the client falls back. */
  draftReport(body: ReportDraftInput): Promise<ReportDraft> {
    return firstValueFrom(this.http.post<ReportDraft>(`${this.base()}/report-draft`, body));
  }

  /** Generate the audit agenda + opening/closing meeting scripts server-side (AI). Rejects when unavailable so the client falls back. */
  draftAgenda(body: AuditAgendaInput): Promise<{ agenda: AuditAgenda; scripts: MeetingScripts }> {
    return firstValueFrom(
      this.http.post<{ agenda: AuditAgenda; scripts: MeetingScripts }>(`${this.base()}/agenda-draft`, body),
    );
  }

  /** Ask the standard via the server-side AI copilot. Rejects when unavailable so the client falls back to the field guide. */
  askCopilot(question: string): Promise<ClauseAnswer> {
    return firstValueFrom(this.http.post<ClauseAnswer>(`${this.base()}/copilot/ask`, { question }));
  }

  /** Generate a first-draft finding (statement, grade, root-cause prompts) server-side (AI). Rejects when unavailable so the client falls back. */
  draftFinding(body: FindingDraftInput): Promise<FindingDraft> {
    return firstValueFrom(this.http.post<FindingDraft>(`${this.base()}/finding-draft`, body));
  }

  signReport(body: { attestation: string; contentHash?: string }): Promise<{ signedAt?: string }> {
    return firstValueFrom(this.http.post<{ signedAt?: string }>(`${this.base()}/reports/signoff`, body));
  }

  upsertAspect(body: Omit<Hazard, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/aspects/${encodeURIComponent(body.id)}`, body));
  }

  upsertObligation(body: Omit<ComplianceObligation, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/obligations/${encodeURIComponent(body.id)}`, body));
  }

  upsertEmergency(body: Omit<EmergencyRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/emergency/${encodeURIComponent(body.id)}`, body));
  }

  upsertInterestedParty(body: Omit<InterestedParty, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/interested-parties/${encodeURIComponent(body.id)}`, body));
  }

  upsertObjective(body: Omit<OhsObjective, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/objectives/${encodeURIComponent(body.id)}`, body));
  }

  upsertCommunication(body: Omit<CommunicationRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/communications/${encodeURIComponent(body.id)}`, body));
  }

  upsertManagementReview(body: Omit<ManagementReviewRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/management-reviews/${encodeURIComponent(body.id)}`, body));
  }

  upsertConsultation(body: Omit<WorkerConsultation, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/worker-consultations/${encodeURIComponent(body.id)}`, body));
  }

  upsertRiskOpportunity(body: Omit<RiskOpportunity, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/risks-opportunities/${encodeURIComponent(body.id)}`, body));
  }

  upsertResource(body: Omit<ResourceRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/resources/${encodeURIComponent(body.id)}`, body));
  }

  upsertCompetence(body: Omit<CompetenceRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/competence/${encodeURIComponent(body.id)}`, body));
  }

  upsertWorker(body: Omit<Worker, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/people/${encodeURIComponent(body.id)}`, body));
  }

  upsertSite(body: Omit<Site, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/sites/${encodeURIComponent(body.id)}`, body));
  }

  upsertAwareness(body: Omit<AwarenessRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/awareness/${encodeURIComponent(body.id)}`, body));
  }

  upsertDocumentedInfo(body: Omit<DocumentedInfoRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/documented-info/${encodeURIComponent(body.id)}`, body));
  }

  upsertPerformanceMetric(body: Omit<PerformanceMetric, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/performance-metrics/${encodeURIComponent(body.id)}`, body));
  }

  upsertPermit(body: Omit<Permit, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/permits/${encodeURIComponent(body.id)}`, body));
  }

  upsertIncident(body: Omit<Incident, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/incidents/${encodeURIComponent(body.id)}`, body));
  }

  upsertHira(body: Omit<HiraEntry, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/hira/${encodeURIComponent(body.id)}`, body));
  }

  upsertCalibration(body: Omit<CalibrationRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/calibration/${encodeURIComponent(body.id)}`, body));
  }

  upsertTraining(body: Omit<TrainingRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/training/${encodeURIComponent(body.id)}`, body));
  }

  upsertSupplier(body: Omit<SupplierRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/suppliers/${encodeURIComponent(body.id)}`, body));
  }

  upsertChange(body: Omit<ManagementOfChangeRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/changes/${encodeURIComponent(body.id)}`, body));
  }

  upsertOperationalControl(body: Omit<OperationalControl, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/operational-controls/${encodeURIComponent(body.id)}`, body));
  }

  upsertLeadershipItem(body: Omit<LeadershipItem, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/leadership/${encodeURIComponent(body.id)}`, body));
  }

  upsertContextItem(body: Omit<ContextItem, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/context/${encodeURIComponent(body.id)}`, body));
  }

  private tenantBase(): string {
    const tenantId = this.auth.user()?.tenantId ?? this.config.tenantId;
    return `${this.config.apiBaseUrl}/tenants/${tenantId}`;
  }

  private base(): string {
    return `${this.tenantBase()}/audits/${this.selection.selectedAuditId()}`;
  }
}

/**
 * Downscale a captured photo to a sensible field size (long edge ~1600px,
 * JPEG q0.8) so uploads stay small over cellular. Falls back to the original
 * blob if the browser can't decode it (e.g. HEIC without codec support).
 */
async function downscaleImage(file: Blob, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
