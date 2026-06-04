import { Db } from 'mongodb';

import { ensureMongoIndexes, mongoCollections } from '../collections.js';
import { loadServerConfig } from '../config.js';
import { getMongoClient } from '../mongo.js';
import { hashPassword } from '../password.js';

const DEMO_TENANT_ID = 'tenant-greenline';
const AUDIT_ID = 'audit-transition-1';
const DEMO_UID = 'uid-ava-auditor';
const DEMO_EMAIL = 'ava.brooks@example-audit.test';
const DEMO_PASSWORD = process.env['DEMO_AUDITOR_PASSWORD'] ?? 'audit-demo-2026';

const now = new Date().toISOString();
function dateOnly(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedDocs(db: Db, name: string, keys: string[], docs: Record<string, unknown>[]): Promise<void> {
  for (const doc of docs) {
    const filter = Object.fromEntries(keys.map((key) => [key, doc[key]]));
    await db.collection(name).updateOne(filter, { $set: doc }, { upsert: true });
  }
}

const base = { tenantId: DEMO_TENANT_ID, auditId: AUDIT_ID };

async function seedDemoAudit(db: Db): Promise<void> {
  await seedDocs(db, mongoCollections.audits, ['tenantId', 'id'], [
    { tenantId: DEMO_TENANT_ID, id: AUDIT_ID, auditeeId: 'auditee-northstar', status: 'reporting', updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.checklistItems, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'item-4', clauseId: '4', clauseTitle: 'Context of the organization', question: 'What internal and external OHSMS context changes should the team verify during this audit?', guidance: 'Use auditee-authored context records, interviews, and site observations.', ownerName: 'Maya Chen', result: 'conform', evidenceIds: [], updatedAt: now },
    { ...base, id: 'item-6', clauseId: '6', clauseTitle: 'Planning', question: 'Which planned controls, objectives, and evidence sources should be sampled for transition readiness?', guidance: 'Keep the prompt tied to auditee records and avoid copying standard text.', ownerName: 'Omar Patel', result: 'minorNc', note: 'Objective tracking evidence partially available; raised as a minor NC.', evidenceIds: ['evidence-seed-note'], updatedAt: now },
    { ...base, id: 'item-8', clauseId: '8', clauseTitle: 'Operation', question: 'Which operational controls should be observed, photographed, or sampled during fieldwork?', guidance: 'Use photo evidence only where site rules allow it.', ownerName: 'Ava Brooks', result: 'conform', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.evidence, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'evidence-seed-note', kind: 'note', itemId: 'item-6', clauseId: '6', label: 'Interviewed EHS manager about transition planning records; objective tracking needs follow-up.', capturedByName: 'Omar Patel', capturedAt: now, geo: { lat: 39.7392, lng: -104.9903, accuracyMeters: 12 }, createdBy: DEMO_UID },
  ]);

  await seedDocs(db, mongoCollections.findings, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'finding-seed-1', clauseId: '6', clauseTitle: 'Planning', type: 'minorNc', description: 'Environmental objective tracking for the 2026 transition is not fully evidenced.', requirementSummary: 'Cl. 6.2 — establish, monitor and retain documented information on environmental objectives.', objectiveEvidence: 'Objectives register shows 2 of 5 objectives without progress records for the current period.', gradingRationale: 'Isolated lapse on a subset of objectives; does not undermine the OHSMS overall — minor.', systemic: false, evidenceIds: ['evidence-seed-note'], status: 'responded', createdByName: 'Omar Patel', createdAt: now },
    { ...base, id: 'finding-seed-2', clauseId: '9.1.2', clauseTitle: 'Evaluation of compliance', type: 'majorNc', description: 'No documented evaluation of compliance was performed for the current cycle.', requirementSummary: 'Cl. 9.1.2 — evaluate fulfilment of compliance obligations at planned intervals.', objectiveEvidence: 'Compliance register last evaluated 2024-03; no evaluation records for 2025–2026.', gradingRationale: 'Absence of a required OHSMS process (evaluation of compliance) — affects OHSMS capability — major.', systemic: true, evidenceIds: [], status: 'open', createdByName: 'Maya Chen', createdAt: now },
  ]);

  await seedDocs(db, mongoCollections.capa, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'capa-seed-1', findingId: 'finding-seed-1', findingRef: 'finding-seed-1', intent: 'correctiveAction', correction: 'Backfilled progress notes for the two affected objectives.', rootCauseMethod: 'fiveWhys', rootCause: 'Objective owners were not reminded to log quarterly progress.', action: 'Add a quarterly objective-review step to the OHSMS calendar with automated owner reminders.', owner: 'EHS Manager', dueDate: dateOnly(45), implementationEvidenceIds: [], verificationEvidenceIds: [], status: 'inProgress', createdAt: now },
  ]);

  await seedDocs(db, mongoCollections.environmentalAspects, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'aspect-1', aspect: 'VOC emissions', activity: 'Coating line operation', impact: 'Air emissions', significance: 'high', controls: 'Enclosed booths + carbon filtration; permit limits monitored.', relatedClauseId: '8.1', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'aspect-2', aspect: 'Process wastewater', activity: 'Parts washing', impact: 'Water discharge', significance: 'medium', controls: 'pH neutralisation and periodic sampling.', relatedClauseId: '8.1', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.complianceObligations, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'oblig-1', obligation: 'Title V air permit', source: 'legal', requirement: 'Annual emissions reporting and continuous limit compliance.', complianceStatus: 'compliant', result: 'conforming', lastEvaluatedAt: dateOnly(-20), evidenceIds: [], updatedAt: now },
    { ...base, id: 'oblig-2', obligation: 'Hazardous waste manifests', source: 'legal', requirement: 'Retain manifests and meet accumulation time limits.', complianceStatus: 'toVerify', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.emergencyRecords, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'emg-1', scenario: 'Chemical spill at the coating line', procedureRef: 'EOP-03', lastDrillAt: dateOnly(-120), notes: 'Spill kits staged at the line; last drill completed and logged.', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.interestedParties, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'party-1', party: 'Environmental regulator (state agency)', category: 'external', needs: 'Permit compliance and timely incident reporting.', howAddressed: 'Permit tracker + reporting calendar owned by EHS.', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'party-2', party: 'Production workforce', category: 'internal', needs: 'Safe handling procedures and OHSMS awareness.', howAddressed: 'Toolbox talks and annual OHSMS training.', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.environmentalObjectives, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'obj-1', objective: 'Reduce VOC emissions intensity', target: '-15% per unit vs 2025 baseline by year-end', owner: 'Operations Manager', dueDate: dateOnly(210), progress: 'onTrack', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'obj-2', objective: 'Divert process waste from landfill', target: '80% diversion rate', owner: 'EHS Manager', dueDate: dateOnly(150), progress: 'atRisk', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.communicationRecords, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'comm-1', topic: 'Environmental policy & objectives', direction: 'internal', audience: 'All staff', method: 'Intranet + noticeboards', frequency: 'On update', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'comm-2', topic: 'Permit compliance status', direction: 'external', audience: 'Regulator', method: 'Formal report', frequency: 'Annual', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.managementReviews, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'review-1', reviewDate: dateOnly(-60), attendees: 'Plant Director, EHS Manager, Operations Manager', inputs: 'Internal audit results, compliance evaluation, objectives progress, incidents, interested-party feedback.', decisions: 'Reinstate quarterly evaluation of compliance; fund waste-diversion initiative.', actions: 'EHS to update the OHSMS calendar; Operations to scope a new waste contractor.', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.risksOpportunities, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'risk-1', description: 'Tightening VOC permit limits could cause non-compliance', kind: 'risk', significance: 'high', treatment: 'Upgrade carbon filtration ahead of the limit change.', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
    { ...base, id: 'risk-2', description: 'Solvent recovery could cut waste cost and impact', kind: 'opportunity', significance: 'medium', treatment: 'Pilot a recovery still on the coating line.', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.resourceRecords, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'res-1', resource: 'EHS team (2 FTE)', category: 'people', adequacy: 'partial', notes: 'Stretched during the transition; recruitment approved.', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
    { ...base, id: 'res-2', resource: 'Continuous emissions monitoring system', category: 'infrastructure', adequacy: 'adequate', notes: 'Calibrated and maintained.', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.competenceRecords, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'comp-1', role: 'Coating line operators', requiredCompetence: 'Safe solvent handling; spill response', trainingEvidence: 'Annual training records on file.', status: 'competent', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'comp-2', role: 'Internal OHSMS auditors', requiredCompetence: 'ISO 45001 internal auditing', trainingEvidence: 'One auditor pending refresher.', status: 'inTraining', result: 'needsFollowUp', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.awarenessRecords, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'aware-1', topic: 'Environmental policy & significant aspects', audience: 'All site staff', method: 'Induction + annual refresher', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.documentedInfo, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'doc-1', document: 'OHSMS Manual', docType: 'Manual', controlStatus: 'controlled', retention: 'Current + 1 superseded', result: 'conforming', evidenceIds: [], updatedAt: now },
    { ...base, id: 'doc-2', document: 'Spill response procedure EOP-03', docType: 'Procedure', controlStatus: 'controlled', retention: '3 years', result: 'conforming', evidenceIds: [], updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.auditMeetings, ['tenantId', 'auditId', 'id'], [
    { ...base, id: 'meeting-opening', kind: 'opening', datetimeAt: now, attendees: ['Maya Chen (Lead)', 'Omar Patel', 'Ava Brooks', 'Elena Ruiz (EHS Manager)'], agendaPoints: ['Confirm scope and criteria', 'Audit methods and sampling', 'Confidentiality and safety', 'Schedule and logistics'], notes: 'Scope confirmed for the Denver Assembly Plant OHSMS transition audit.', acknowledged: true, updatedAt: now },
    { ...base, id: 'meeting-closing', kind: 'closing', datetimeAt: now, attendees: ['Maya Chen (Lead)', 'Elena Ruiz (EHS Manager)'], agendaPoints: ['Present findings', 'Agree corrective-action timelines', 'Next steps and report timing'], notes: 'One major and one minor nonconformity presented; timelines agreed with the auditee.', acknowledged: true, updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.auditConclusions, ['tenantId', 'auditId'], [
    { ...base, overallConformity: 'The OHSMS broadly conforms with the ISO 45001:2026 criteria, with one major and one minor nonconformity to close.', emsEffectivenessOpinion: 'The OHSMS is largely effective; the evaluation-of-compliance process must be reinstated.', criteriaMetStatement: 'Criteria met except clause 9.1.2 (evaluation of compliance).', divergingOpinions: '', recommendation: 'conditional', updatedAt: now },
  ]);

  await seedDocs(db, mongoCollections.auditProgrammes, ['tenantId'], [
    {
      tenantId: DEMO_TENANT_ID,
      cycleYear: new Date().getFullYear(),
      criteria: 'ISO_45001_2018',
      plannedAudits: [
        { id: 'plan-stage2', type: 'certificationStage2', dueDate: dateOnly(-30), status: 'completed' },
        { id: 'plan-surv-1', type: 'surveillance', dueDate: dateOnly(330), status: 'planned' },
        { id: 'plan-recert', type: 'recertification', dueDate: dateOnly(1065), status: 'planned' },
      ],
      competence: [
        { id: 'comp-maya', memberName: 'Maya Chen', qualifications: 'IRCA Lead Auditor; ISO 45001 OHSMS', impartialityDeclared: true },
        { id: 'comp-ava', memberName: 'Ava Brooks', qualifications: 'ISO 45001 Auditor', impartialityDeclared: true },
      ],
      updatedAt: now,
    },
  ]);
}

async function main(): Promise<void> {
  const config = loadServerConfig();
  const client = await getMongoClient(config);
  const db = client.db(config.mongoDbName);

  await ensureMongoIndexes(db);

  await db.collection(mongoCollections.tenants).updateOne(
    { id: DEMO_TENANT_ID },
    { $setOnInsert: { id: DEMO_TENANT_ID, name: 'Greenline Assurance', plan: 'pilot', status: 'active', createdAt: now } },
    { upsert: true },
  );

  await db.collection(mongoCollections.members).updateOne(
    { tenantId: DEMO_TENANT_ID, uid: DEMO_UID },
    {
      $set: { passwordHash: hashPassword(DEMO_PASSWORD) },
      $setOnInsert: {
        uid: DEMO_UID,
        tenantId: DEMO_TENANT_ID,
        role: 'leadAuditor',
        status: 'active',
        profile: { email: DEMO_EMAIL, displayName: 'Ava Brooks' },
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await seedDemoAudit(db);

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: db.databaseName,
        collections: Object.values(mongoCollections),
        demoLogin: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
        seededAudit: AUDIT_ID,
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
