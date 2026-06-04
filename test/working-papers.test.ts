import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BuildWorkingPapersInput,
  WORKING_PAPERS_VERSION,
  buildWorkingPapers,
  workingPapersFindingRows,
} from '../src/app/core/domain/working-papers';

function sampleInput(overrides: Partial<BuildWorkingPapersInput> = {}): BuildWorkingPapersInput {
  return {
    auditee: 'Northstar Components — Denver',
    criteria: 'ISO 45001:2018',
    reportMeta: {
      auditType: 'stage2',
      scope: 'Assembly & finishing',
      objectives: 'Determine conformity',
      sites: 'Denver (1 of 1)',
      leadAuditorName: 'Ava Brooks',
      impartialityDeclared: true,
      reportVersion: 1,
    },
    status: 'reporting',
    signedAt: '2026-06-15T18:00:00.000Z',
    signatureFingerprint: 'ABCD-1234',
    items: [
      { clauseId: '4', clauseTitle: 'Context', question: 'Is context determined?', ownerName: 'Maya', result: 'conform', evidenceIds: [] },
      { clauseId: '6', clauseTitle: 'Planning', question: 'Are objectives planned?', result: 'ofi', note: 'Partial', evidenceIds: ['ev-1'] },
    ],
    findings: [
      {
        id: 'f1', clauseId: '6', clauseTitle: 'Planning', type: 'minorNc', status: 'open',
        description: 'Objectives not fully evidenced', systemic: false, evidenceIds: ['ev-1'],
        createdByName: 'Omar', createdAt: '2026-06-15T18:40:00.000Z',
      },
    ],
    capas: [
      {
        id: 'c1', findingId: 'f1', intent: 'correctiveAction', action: 'Add progress records',
        owner: 'H&S Lead', status: 'open', createdAt: '2026-06-15T19:00:00.000Z',
      },
    ],
    evidence: [
      {
        id: 'ev-1', kind: 'note', label: 'Interview note', clauseId: '6', itemId: 'item-6',
        capturedByName: 'Omar', capturedAt: '2026-06-15T18:30:00.000Z',
      },
      {
        id: 'ev-2', kind: 'photo', label: 'Guard rail photo', clauseId: '8',
        capturedByName: 'Ava', capturedAt: '2026-06-15T18:35:00.000Z', blobKey: 'blob-xyz', uploaded: true,
      },
    ],
    evidenceRequests: [
      {
        id: 'r1', title: 'Objectives register', clauseId: '6.2', status: 'requested',
        submissions: [{}], messages: [{}, {}], createdByName: 'Ava', createdAt: '2026-06-14T09:00:00.000Z',
      },
    ],
    meetings: [
      { id: 'm1', kind: 'opening', datetimeAt: '2026-06-15T09:00:00.000Z', attendees: ['Ava', 'Dana'], agendaPoints: ['Scope'], acknowledged: true },
    ],
    registers: {
      incidents: [{ id: 'i1' }, { id: 'i2' }],
      permits: [{ id: 'p1' }],
      empty: [],
    },
    conclusion: {
      overallConformity: 'Largely conforming', recommendation: 'conditional', updatedAt: '2026-06-15T19:30:00.000Z',
    },
    changeLog: [
      { id: 'l1', actorUid: 'u1', action: 'created', target: 'finding', targetId: 'f1', at: '2026-06-15T18:40:00.000Z' },
    ],
    generatedAt: '2026-06-16T08:00:00.000Z',
    ...overrides,
  };
}

describe('buildWorkingPapers', () => {
  it('assembles a versioned pack with all expected top-level sections', () => {
    const pack = buildWorkingPapers(sampleInput());
    assert.equal(pack.version, WORKING_PAPERS_VERSION);
    assert.equal(pack.generatedAt, '2026-06-16T08:00:00.000Z');
    for (const key of [
      'audit', 'checklist', 'findings', 'capas', 'evidence', 'evidenceRequests',
      'meetings', 'registers', 'conclusion', 'changeLog', 'counts',
    ]) {
      assert.ok(key in pack, `missing section: ${key}`);
    }
  });

  it('carries the audit metadata including signature fingerprint (hash only)', () => {
    const pack = buildWorkingPapers(sampleInput());
    assert.equal(pack.audit.auditee, 'Northstar Components — Denver');
    assert.equal(pack.audit.criteria, 'ISO 45001:2018');
    assert.equal(pack.audit.auditType, 'stage2');
    assert.equal(pack.audit.signedAt, '2026-06-15T18:00:00.000Z');
    assert.equal(pack.audit.signatureFingerprint, 'ABCD-1234');
    assert.equal(pack.audit.status, 'reporting');
  });

  it('reports per-section counts that match the input', () => {
    const pack = buildWorkingPapers(sampleInput());
    assert.equal(pack.counts.checklist, 2);
    assert.equal(pack.counts.findings, 1);
    assert.equal(pack.counts.capas, 1);
    assert.equal(pack.counts.evidence, 2);
    assert.equal(pack.counts.evidenceRequests, 1);
    assert.equal(pack.counts.meetings, 1);
    assert.equal(pack.counts.changeLog, 1);
    // registers count is the total rows across non-empty registers (2 + 1)
    assert.equal(pack.counts.registers, 3);
  });

  it('includes evidence metadata only — never the blob — flagging photos via hasPhoto', () => {
    const pack = buildWorkingPapers(sampleInput());
    const photo = pack.evidence.find((e) => e.id === 'ev-2');
    const note = pack.evidence.find((e) => e.id === 'ev-1');
    assert.ok(photo);
    assert.equal(photo.hasPhoto, true);
    assert.equal(note?.hasPhoto, false);
    // The serialised pack must not leak any blob key.
    const json = JSON.stringify(pack);
    assert.ok(!json.includes('blob-xyz'), 'blob key leaked into the pack');
    assert.ok(!json.includes('blobKey'), 'blobKey field leaked into the pack');
  });

  it('drops empty registers and flattens evidence-request threads to counts', () => {
    const pack = buildWorkingPapers(sampleInput());
    assert.ok(!('empty' in pack.registers), 'empty register should be dropped');
    assert.deepEqual(Object.keys(pack.registers).sort(), ['incidents', 'permits']);
    assert.equal(pack.evidenceRequests[0]?.submissionCount, 1);
    assert.equal(pack.evidenceRequests[0]?.messageCount, 2);
  });

  it('is JSON-serialisable and stable for the same input (aside from generatedAt)', () => {
    const a = buildWorkingPapers(sampleInput());
    const b = buildWorkingPapers(sampleInput());
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it('handles a minimal audit with no optional sections', () => {
    const pack = buildWorkingPapers({
      auditee: 'Acme', criteria: 'ISO 45001:2018', items: [], findings: [], capas: [], evidence: [],
      generatedAt: '2026-06-16T08:00:00.000Z',
    });
    assert.equal(pack.conclusion, null);
    assert.deepEqual(pack.evidenceRequests, []);
    assert.deepEqual(pack.meetings, []);
    assert.deepEqual(pack.registers, {});
    assert.equal(pack.counts.findings, 0);
    assert.equal(pack.audit.signedAt, null);
  });
});

describe('workingPapersFindingRows', () => {
  it('flattens findings into CSV-ready rows with yes/no systemic and evidence counts', () => {
    const rows = workingPapersFindingRows(buildWorkingPapers(sampleInput()));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.clauseId, '6');
    assert.equal(rows[0]?.type, 'minorNc');
    assert.equal(rows[0]?.systemic, 'no');
    assert.equal(rows[0]?.evidenceCount, 1);
  });
});
