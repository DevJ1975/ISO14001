import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditSchema,
  findingSchema,
  hasPermission,
  photoAiAnalysisSchema,
  photoEvidenceSchema,
  sharedClauseTitles,
  standardEditionSchema,
} from '../src/app/core/domain';

describe('domain contracts', () => {
  it('keeps standards seed limited to identifiers and titles', () => {
    for (const edition of sharedClauseTitles) {
      const parsed = standardEditionSchema.parse(edition);
      assert.match(parsed.copyrightNotice, /Clause identifiers and short titles only/);
      assert.equal(parsed.clauses.some((clause) => clause.title.length > 80), false);
    }
  });

  it('grants capture permission to auditors but not client viewers', () => {
    assert.equal(hasPermission('auditor', 'audits.captureEvidence'), true);
    assert.equal(hasPermission('clientViewer', 'audits.captureEvidence'), false);
  });

  it('requires assigned members and tenant attribution on audits', () => {
    const audit = auditSchema.parse({
      id: 'audit-1',
      tenantId: 'tenant-a',
      auditeeId: 'client-1',
      criteria: 'ISO_14001_2026',
      scope: 'Main production site EMS transition audit',
      objectives: ['Verify transition readiness'],
      assignedMembers: ['uid-lead'],
      leadAuditor: 'uid-lead',
      sectionOwners: { '4': 'uid-lead' },
      dates: {
        startsAt: '2026-06-01T09:00:00.000Z',
        endsAt: '2026-06-03T17:00:00.000Z',
      },
      status: 'planned',
      createdAt: '2026-05-29T12:00:00.000Z',
      updatedAt: '2026-05-29T12:00:00.000Z',
    });

    assert.equal(audit.tenantId, 'tenant-a');
    assert.deepEqual(audit.assignedMembers, ['uid-lead']);
  });

  it('keeps AI output in draft metadata until an auditor confirms the finding', () => {
    const finding = findingSchema.parse({
      id: 'finding-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      type: 'minorNc',
      clauseRef: {
        standard: 'ISO_14001',
        edition: 'ISO_14001_2026',
        clauseId: '6',
        title: 'Planning',
      },
      severity: 'minor',
      description: 'Procedure review identified a transition planning gap.',
      evidenceRefs: ['evidence-1'],
      status: 'draft',
      aiDraft: {
        generatedAt: '2026-05-29T12:00:00.000Z',
        model: 'gemini-provider-placeholder',
        promptHash: 'sha256-placeholder',
        citations: ['ems-doc-1#chunk-4'],
      },
      createdBy: 'uid-auditor',
      createdAt: '2026-05-29T12:00:00.000Z',
      updatedAt: '2026-05-29T12:00:00.000Z',
    });

    assert.equal(finding.status, 'draft');
    assert.equal(finding.aiDraft?.citations.length, 1);
  });

  it('models camera photo evidence with storage and source metadata', () => {
    const photo = photoEvidenceSchema.parse({
      id: 'evidence-photo-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      type: 'photo',
      storageRef: 'tenants/tenant-a/audits/audit-1/evidence/photos/tank-label.webp',
      timestamp: '2026-05-29T12:00:00.000Z',
      geo: {
        lat: 39.7392,
        lng: -104.9903,
        accuracyMeters: 8,
      },
      createdBy: 'uid-auditor',
      links: ['checklist-6-1'],
      media: {
        fileName: 'tank-label.webp',
        mimeType: 'image/webp',
        byteSize: 812000,
        widthPx: 1600,
        heightPx: 1200,
        sha256: 'f'.repeat(64),
      },
      capture: {
        source: 'camera',
        capturedAt: '2026-05-29T12:00:00.000Z',
        offlineLocalId: 'local-photo-1',
      },
    });

    assert.equal(photo.type, 'photo');
    assert.equal(photo.capture.source, 'camera');
    assert.equal(photo.media.mimeType, 'image/webp');
  });

  it('keeps AI photo identification in auditor-review status before use', () => {
    const analysis = photoAiAnalysisSchema.parse({
      id: 'analysis-1',
      tenantId: 'tenant-a',
      auditeeId: 'client-1',
      auditId: 'audit-1',
      evidenceId: 'evidence-photo-1',
      storageRef: 'tenants/tenant-a/audits/audit-1/evidence/photos/tank-label.webp',
      imageHash: 'a'.repeat(64),
      status: 'needsAuditorReview',
      requestedBy: 'uid-auditor',
      requestedAt: '2026-05-29T12:00:00.000Z',
      provider: 'vertexGemini',
      model: 'gemini-vision-placeholder',
      promptHash: 'prompt-hash-1',
      generatedAt: '2026-05-29T12:01:00.000Z',
      observations: [
        {
          label: 'Unlabeled chemical storage container',
          confidence: 0.82,
          signal: 'chemicalStorage',
          boundingBox: { x: 0.18, y: 0.2, width: 0.44, height: 0.52 },
          rationale: 'Container and nearby signage are visible in the image.',
        },
      ],
      detectedText: ['flammable'],
      findingCandidates: [
        {
          summary: 'Review chemical container labeling and storage controls.',
          suggestedType: 'ofi',
          suggestedSeverity: 'opportunity',
          clauseSuggestions: [
            {
              clauseRef: {
                standard: 'ISO_14001',
                edition: 'ISO_14001_2026',
                clauseId: '8',
                title: 'Operation',
              },
              rationale: 'The image appears related to operational control of chemical storage.',
            },
          ],
          evidenceRationale: 'Visible container condition may support an auditor follow-up question.',
        },
      ],
    });

    assert.equal(analysis.status, 'needsAuditorReview');
    assert.equal(analysis.observations[0]?.signal, 'chemicalStorage');
  });

  it('requires auditor attribution before accepting AI photo analysis', () => {
    const result = photoAiAnalysisSchema.safeParse({
      id: 'analysis-2',
      tenantId: 'tenant-a',
      auditeeId: 'client-1',
      auditId: 'audit-1',
      evidenceId: 'evidence-photo-1',
      storageRef: 'tenants/tenant-a/audits/audit-1/evidence/photos/tank-label.webp',
      imageHash: 'b'.repeat(64),
      status: 'accepted',
      requestedBy: 'uid-auditor',
      requestedAt: '2026-05-29T12:00:00.000Z',
      provider: 'vertexGemini',
      model: 'gemini-vision-placeholder',
      promptHash: 'prompt-hash-1',
    });

    assert.equal(result.success, false);
  });
});
