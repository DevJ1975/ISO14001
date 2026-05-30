import { InjectionToken } from '@angular/core';

import { PhaseSixCallableName } from '../domain';

export interface MongoDbApiBackend {
  readonly type: 'mongodb-api';
  readonly apiBaseUrl: string;
  readonly databaseName: string;
  readonly callableNames: readonly PhaseSixCallableName[];
}

export const mongodbApiBackend: MongoDbApiBackend = {
  type: 'mongodb-api',
  apiBaseUrl: '/api',
  databaseName: 'iso14001_auditor',
  callableNames: [
    'createTenant',
    'inviteTenantMember',
    'assignMemberClaims',
    'createEvidenceUploadIntent',
    'requestPhotoAnalysis',
    'generateAuditReportPdf',
    'scheduleCapaReminder',
  ],
};

export const MONGODB_API_BACKEND = new InjectionToken<MongoDbApiBackend>('MongoDB API backend', {
  providedIn: 'root',
  factory: () => mongodbApiBackend,
});
