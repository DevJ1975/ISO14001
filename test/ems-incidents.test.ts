import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { environmentalIncidentSchema, isIncidentOpen } from '../src/app/core/domain';

describe('environmental incident register (cl. 10.2 / 8.2)', () => {
  it('validates an incident and applies defaults', () => {
    const incident = environmentalIncidentSchema.parse({
      id: 'inc-1', tenantId: 't', auditId: 'a', title: 'Oil spill at press 3',
      occurredAt: '2026-05-12', location: 'Assembly hall', incidentType: 'spill', severity: 'high',
      updatedAt: '2026-05-31T00:00:00.000Z',
    });
    assert.equal(incident.status, 'open');
    assert.equal(incident.result, 'notStarted');
    assert.equal(incident.severity, 'high');
    assert.deepEqual(incident.evidenceIds, []);
  });

  it('treats open/investigating/actioned as open and closed as not open', () => {
    assert.equal(isIncidentOpen({ status: 'open' }), true);
    assert.equal(isIncidentOpen({ status: 'investigating' }), true);
    assert.equal(isIncidentOpen({ status: 'actioned' }), true);
    assert.equal(isIncidentOpen({ status: 'closed' }), false);
  });

  it('rejects an unknown incident type', () => {
    assert.throws(() =>
      environmentalIncidentSchema.parse({
        id: 'inc-2', tenantId: 't', auditId: 'a', title: 'x', incidentType: 'meteor', updatedAt: '2026-05-31T00:00:00.000Z',
      }),
    );
  });
});
