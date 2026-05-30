import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  awarenessRecordSchema,
  communicationRecordSchema,
  competenceRecordSchema,
  documentedInfoSchema,
  environmentalObjectiveSchema,
  interestedPartySchema,
  managementReviewSchema,
  resourceRecordSchema,
  riskOpportunitySchema,
  sharedClauseTitles,
} from '../src/app/core/domain';

describe('EMS governance registers (clause-gap closure)', () => {
  it('validates an interested party (cl. 4.2)', () => {
    const party = interestedPartySchema.parse({
      id: 'party-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      party: 'Environmental regulator',
      category: 'external',
      needs: 'Permit compliance and reporting',
      updatedAt: '2026-05-30T12:00:00.000Z',
    });
    assert.equal(party.category, 'external');
    assert.equal(party.result, 'notStarted');
  });

  it('tracks an environmental objective with progress (cl. 6.2)', () => {
    const objective = environmentalObjectiveSchema.parse({
      id: 'obj-1',
      tenantId: 'tenant-a',
      auditId: 'audit-1',
      objective: 'Reduce VOC emissions',
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
      topic: 'Environmental policy',
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
    assert.equal(riskOpportunitySchema.parse({ ...base, id: 'r1', description: 'Permit limit risk', kind: 'risk', significance: 'high' }).kind, 'risk');
    assert.equal(resourceRecordSchema.parse({ ...base, id: 'res1', resource: 'EHS team', category: 'people', adequacy: 'partial' }).adequacy, 'partial');
    assert.equal(competenceRecordSchema.parse({ ...base, id: 'c1', role: 'Operators', status: 'inTraining' }).status, 'inTraining');
    assert.equal(awarenessRecordSchema.parse({ ...base, id: 'a1', topic: 'Policy' }).result, 'notStarted');
    assert.equal(documentedInfoSchema.parse({ ...base, id: 'd1', document: 'EMS Manual', controlStatus: 'controlled' }).controlStatus, 'controlled');
  });

  it('exposes the management-review and communication sub-clauses for precise NC referencing', () => {
    const edition = sharedClauseTitles.find((e) => e.id === 'ISO_14001_2026');
    assert.ok(edition, 'expected the 2026 edition');
    const ids = edition!.clauses.map((clause) => clause.clauseId);
    for (const id of ['4.2', '6.1.2', '6.2', '7.4', '9.1.2', '9.2', '9.3', '10.2']) {
      assert.ok(ids.includes(id), `expected sub-clause ${id} to be present`);
    }
    // Copyright guardrail still holds: short titles only.
    assert.equal(edition!.clauses.some((clause) => clause.title.length > 80), false);
  });
});
