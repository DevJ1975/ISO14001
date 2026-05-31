import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { permitDaysUntilExpiry, permitExpiryStatus, permitSchema } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('permit register & expiry (cl. 6.1.3 / 9.1.2)', () => {
  it('classifies a permit well inside its window as valid', () => {
    assert.equal(permitExpiryStatus({ expiresAt: '2027-09-30', renewalReminderDays: 90 }, NOW), 'valid');
  });

  it('flags a permit inside the renewal window as expiring soon', () => {
    assert.equal(permitExpiryStatus({ expiresAt: '2026-07-15', renewalReminderDays: 90 }, NOW), 'expiringSoon');
    // edge: exactly on the window boundary still counts as expiring soon
    assert.equal(permitExpiryStatus({ expiresAt: '2026-08-29', renewalReminderDays: 90 }, NOW), 'expiringSoon');
  });

  it('flags a past expiry as expired and a missing date as noDate', () => {
    assert.equal(permitExpiryStatus({ expiresAt: '2026-02-28', renewalReminderDays: 90 }, NOW), 'expired');
    assert.equal(permitExpiryStatus({ renewalReminderDays: 90 }, NOW), 'noDate');
  });

  it('defaults the renewal window to 90 days', () => {
    assert.equal(permitExpiryStatus({ expiresAt: '2026-08-01' }, NOW), 'expiringSoon');
    assert.equal(permitExpiryStatus({ expiresAt: '2026-12-01' }, NOW), 'valid');
  });

  it('computes signed days until expiry', () => {
    assert.equal(permitDaysUntilExpiry({ expiresAt: '2026-06-10' }, NOW), 10);
    assert.equal(permitDaysUntilExpiry({ expiresAt: '2026-05-21' }, NOW), -10);
    assert.equal(permitDaysUntilExpiry({}, NOW), null);
  });

  it('validates a permit and applies defaults', () => {
    const permit = permitSchema.parse({
      id: 'permit-1', tenantId: 't', auditId: 'a', title: 'Environmental permit',
      reference: 'EPR/AB1234CD', expiresAt: '2027-09-30', updatedAt: NOW,
    });
    assert.equal(permit.permitType, 'permit');
    assert.equal(permit.renewalReminderDays, 90);
    assert.equal(permit.complianceStatus, 'toVerify');
    assert.equal(permit.result, 'notStarted');
  });
});
