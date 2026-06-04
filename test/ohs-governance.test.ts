import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  awarenessRecordSchema,
  communicationRecordSchema,
  competenceRecordSchema,
  documentedInfoSchema,
  ohsObjectiveSchema,
  interestedPartySchema,
  managementReviewSchema,
  resourceRecordSchema,
  riskOpportunitySchema,
  sharedClauseTitles,
} from '../src/app/core/domain';

describe('OH&S governance registers (clause-gap closure)', () => {
  it('validates an interested party (cl. 4.2)', () => {
    const party = interestedPartySchema.parse({
      id: 'party-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      party: 'Health & safety regulator',
      category: 'external',
      needs: 'Statutory compliance and RIDDOR reporting',
      updatedAt: '2026-05-30T12:00:00.000Z',
    });
    assert.equal(party.category, 'external');
    assert.equal(party.result, 'notStarted');
  });

  it('tracks an OH&S objective with progress (cl. 6.2)', () => {
    const objective = ohsObjectiveSchema.parse({
      id: 'obj-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      objective: 'Reduce lost-time injury frequency rate',
      target: '-15% vs baseline',
      progress: 'onTrack',
      updatedAt: '2026-05-30T12:00:00.000Z',
    });
    assert.equal(objective.progress, 'onTrack');
  });

  it('records communication arrangements (cl. 7.4)', () => {
    const comm = communicationRecordSchema.parse({
      id: 'comm-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      topic: 'OH&S policy',
      direction: 'internal',
      updatedAt: '2026-05-30T12:00:00.000Z',
    });
    assert.equal(comm.direction, 'internal');
  });

  it('captures management review inputs and outputs (cl. 9.3)', () => {
    const review = managementReviewSchema.parse({
      id: 'review-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      inputs: 'Internal audit results, compliance evaluation',
      decisions: 'Reinstate quarterly evaluation of compliance',
      updatedAt: '2026-05-30T12:00:00.000Z',
    });
    assert.equal(review.result, 'notStarted');
    assert.match(review.decisions ?? '', /compliance/);
  });

  it('validates the Clause 7 registers and the 6.1 risk/opportunity register', () => {
    const base = { tenantId: 'tenant-a', auditId: 'audit-1', updatedAt: '2026-05-30T12:00:00.000Z' };
    assert.equal(riskOpportunitySchema.parse({ ...base, id: 'r1', description: 'Lone-working risk', kind: 'risk', significance: 'high' }).kind, 'risk');
    assert.equal(resourceRecordSchema.parse({ ...base, id: 'res1', resource: 'OH&S team', category: 'people', adequacy: 'partial' }).adequacy, 'partial');
    assert.equal(competenceRecordSchema.parse({ ...base, id: 'c1', role: 'Operators', status: 'inTraining' }).status, 'inTraining');
    assert.equal(awarenessRecordSchema.parse({ ...base, id: 'a1', topic: 'Policy' }).result, 'notStarted');
    assert.equal(documentedInfoSchema.parse({ ...base, id: 'd1', document: 'OH&S Manual', controlStatus: 'controlled' }).controlStatus, 'controlled');
  });

  it('exposes the management-review and communication sub-clauses for precise NC referencing', () => {
    const edition = sharedClauseTitles.find((e) => e.id === 'ISO_45001_2018');
    assert.ok(edition, 'expected the 2018 edition');
    const ids = edition!.clauses.map((clause) => clause.clauseId);
    for (const id of ['4.2', '5.4', '6.1.2', '6.2', '7.4', '9.1.2', '9.2', '9.3', '10.2']) {
      assert.ok(ids.includes(id), `expected sub-clause ${id} to be present`);
    }
    // Copyright guardrail still holds: short titles only.
    assert.equal(edition!.clauses.some((clause) => clause.title.length > 80), false);
  });
});
