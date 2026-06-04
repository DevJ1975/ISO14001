import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { internalAuditSchema, isInternalAuditOverdue } from '../src/app/core/domain';

describe('internal-audit programme (ISO 45001 cl. 9.2)', () => {
  it('parses an internal-audit entry with defaults', () => {
    const parsed = internalAuditSchema.parse({ id: 'ia-1' });
    assert.equal(parsed.scopeArea, '');
    assert.equal(parsed.plannedDate, '');
    assert.equal(parsed.status, 'planned');
    assert.equal(parsed.auditorName, undefined);
    assert.equal(parsed.impartialityConfirmed, undefined);
  });

  it('keeps optional auditor + impartiality + findings fields', () => {
    const parsed = internalAuditSchema.parse({
      id: 'ia-2',
      scopeArea: 'Clause 8 operational controls',
      plannedDate: '2026-09-01',
      status: 'inProgress',
      auditorName: 'Priya Singh',
      impartialityConfirmed: true,
      findingsSummary: '2 OFIs raised, follow-up due',
      notes: 'sample shifts A and B',
    });
    assert.equal(parsed.auditorName, 'Priya Singh');
    assert.equal(parsed.impartialityConfirmed, true);
    assert.equal(parsed.findingsSummary, '2 OFIs raised, follow-up due');
  });

  it('flags a planned audit past its date as overdue', () => {
    const now = '2026-06-04T00:00:00.000Z';
    assert.equal(isInternalAuditOverdue({ status: 'planned', plannedDate: '2026-05-01' }, now), true);
    assert.equal(isInternalAuditOverdue({ status: 'inProgress', plannedDate: '2026-05-01' }, now), true);
  });

  it('does not flag completed or future audits as overdue', () => {
    const now = '2026-06-04T00:00:00.000Z';
    assert.equal(isInternalAuditOverdue({ status: 'completed', plannedDate: '2026-05-01' }, now), false);
    assert.equal(isInternalAuditOverdue({ status: 'planned', plannedDate: '2026-12-01' }, now), false);
  });

  it('treats missing or invalid planned dates as not overdue', () => {
    const now = '2026-06-04T00:00:00.000Z';
    assert.equal(isInternalAuditOverdue({ status: 'planned', plannedDate: '' }, now), false);
    assert.equal(isInternalAuditOverdue({ status: 'planned', plannedDate: 'not-a-date' }, now), false);
    assert.equal(isInternalAuditOverdue({ status: 'planned' }, now), false);
  });
});
