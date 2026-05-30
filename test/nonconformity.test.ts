import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditTypeSchema,
  capaTimelineDays,
  classifyFinding,
  complianceObligationSchema,
  ncStatusSchema,
  nonconformitySchema,
  recommendationSchema,
  recertificationDue,
  surveillanceDue,
} from '../src/app/core/domain';

describe('nonconformity classification', () => {
  it('grades an improvement-only finding as OFI', () => {
    assert.equal(classifyFinding({ isImprovementOnly: true }).grade, 'ofi');
  });

  it('grades an isolated lapse as minor with the minor timeline', () => {
    const result = classifyFinding({ isIsolatedLapse: true });
    assert.equal(result.grade, 'minorNc');
    assert.equal(result.systemic, false);
    assert.equal(result.timelineDays, capaTimelineDays.minorNc);
  });

  it('grades absence of a required process as a systemic major', () => {
    const result = classifyFinding({ isAbsentOrTotalBreakdown: true });
    assert.equal(result.grade, 'majorNc');
    assert.equal(result.systemic, true);
    assert.equal(result.timelineDays, capaTimelineDays.majorNc);
  });

  it('escalates multiple minors against one requirement to major', () => {
    assert.equal(classifyFinding({ minorCountAgainstRequirement: 2 }).grade, 'majorNc');
    assert.equal(classifyFinding({ minorCountAgainstRequirement: 1 }).grade, 'minorNc');
  });
});

describe('audit domain schemas', () => {
  it('parses a nonconformity record with a clause reference', () => {
    const nc = nonconformitySchema.parse({
      id: 'nc-1',
      tenantId: 't',
      auditId: 'a',
      clauseRef: {
        standard: 'ISO_14001',
        edition: 'ISO_14001_2026',
        clauseId: '9.1.2',
        title: 'Evaluation of compliance',
      },
      requirementSummary: 'Evaluate compliance with compliance obligations',
      statement: 'No records of compliance evaluation for 2025 were available.',
      objectiveEvidence: 'Compliance register last evaluated 2024-03; no 2025 entries on file.',
      grade: 'minorNc',
      createdBy: 'u',
      createdAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-15T12:00:00.000Z',
    });
    assert.equal(nc.grade, 'minorNc');
    assert.equal(nc.status, 'open');
  });

  it('accepts the expected enum values', () => {
    assert.equal(ncStatusSchema.safeParse('reopened').success, true);
    assert.equal(recommendationSchema.safeParse('conditional').success, true);
    assert.equal(auditTypeSchema.safeParse('surveillance').success, true);
    assert.equal(complianceObligationSchema.shape.complianceStatus.safeParse('toVerify').success, true);
  });

  it('computes surveillance and recertification due dates', () => {
    assert.equal(surveillanceDue('2026-01-01T00:00:00.000Z').startsWith('2027-01-01'), true);
    assert.equal(recertificationDue('2026-01-01T00:00:00.000Z').startsWith('2029-01-01'), true);
  });
});
