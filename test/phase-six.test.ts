import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  backendJobSchema,
  buildPhotoEvidenceStorageRef,
  callableFunctionContractSchema,
  evidenceUploadIntentCommandSchema,
  evidenceUploadIntentSchema,
  hasRequiredCallableCoverage,
  isPhaseSixProductionReady,
  phaseSixReadinessItemSchema,
} from '../src/app/core/domain';
import {
  demoBackendJobs,
  demoCallableFunctionContracts,
  demoEvidenceUploadIntent,
  demoPhaseSixReadiness,
} from '../src/app/features/dashboard/phase-six-demo';
import { authenticateRequest } from '../server/auth';
import { mongoCollections } from '../server/collections';
import { loadServerConfig } from '../server/config';

describe('phase 6 MongoDB backend', () => {
  it('covers required API contracts for MongoDB-backed operations', () => {
    const contracts = demoCallableFunctionContracts.map((contract) => callableFunctionContractSchema.parse(contract));

    assert.equal(contracts.length, 7);
    assert.equal(hasRequiredCallableCoverage(contracts), true);
    assert.equal(contracts.some((contract) => contract.name === 'createEvidenceUploadIntent'), true);
    assert.equal(contracts.every((contract) => contract.writes.includes('backendJobs')), true);
  });

  it('creates tenant-scoped photo upload intents without exposing MongoDB to the browser', () => {
    const command = evidenceUploadIntentCommandSchema.parse({
      tenantId: 'tenant-greenline',
      auditId: 'audit-transition-1',
      auditeeId: 'auditee-harbor',
      checklistItemId: 'audit-item-operation-8',
      fileName: 'secondary containment 01.JPG',
      mimeType: 'image/jpeg',
      byteSize: 512_000,
      sha256: 'f'.repeat(64),
      capturedByUid: 'uid-ava-auditor',
      capturedAt: '2026-06-21T19:04:00.000Z',
      idempotencyKey: 'upload-intent-test-001',
    });

    const ref = buildPhotoEvidenceStorageRef(command, 'evidence-photo-1');

    assert.equal(ref.startsWith('tenants/tenant-greenline/audits/audit-transition-1/evidence/photos/'), true);
    assert.equal(ref.includes('secondary-containment-01.JPG'), true);
    assert.equal(evidenceUploadIntentSchema.parse(demoEvidenceUploadIntent).tenantId, 'tenant-greenline');
  });

  it('tracks backend jobs and production readiness separately', () => {
    const jobs = demoBackendJobs.map((job) => backendJobSchema.parse(job));
    const readiness = demoPhaseSixReadiness.map((item) => phaseSixReadinessItemSchema.parse(item));

    assert.equal(jobs.length, 3);
    assert.equal(jobs.every((job) => job.status === 'queued'), true);
    assert.equal(isPhaseSixProductionReady(readiness), false);
  });

  it('loads MongoDB server config from environment variables', () => {
    const config = loadServerConfig({
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_DB_NAME: 'iso_test',
      PORT: '4310',
      CORS_ORIGIN: 'http://127.0.0.1:4200',
      ALLOW_DEV_AUTH_HEADERS: 'true',
    });

    assert.equal(config.mongoDbName, 'iso_test');
    assert.equal(config.port, 4310);
    assert.equal(config.allowDevAuthHeaders, true);
  });

  it('keeps local development auth explicit and disabled by default', () => {
    const config = loadServerConfig({
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
    });

    assert.equal(config.allowDevAuthHeaders, false);
    assert.throws(() => {
      authenticateRequest(
        {
          headers: {
            'x-iso-actor-uid': 'uid-ava-auditor',
            'x-iso-role': 'auditor',
            'x-iso-tenant-id': 'tenant-greenline',
          },
        },
        config,
      );
    }, /Missing bearer token/);
  });

  it('names MongoDB collections for tenant-scoped data and async jobs', () => {
    assert.equal(mongoCollections.tenants, 'tenants');
    assert.equal(mongoCollections.backendJobs, 'backendJobs');
    assert.equal(mongoCollections.evidenceUploadIntents, 'evidenceUploadIntents');
  });
});
