import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
import { handleApiRequest } from '../server/routes';

// End-to-end trace of the lead-auditor journey across the API: checklist →
// evidence → finding → CAPA → governance register → conclusion → sign-off,
// then a field-state read that must reflect every write. This is the API-level
// equivalent of the manual click-through in the audit plan's verification.
const config = loadServerConfig({ MONGODB_URI: 'mongodb://localhost:27017', ALLOW_DEV_AUTH_HEADERS: 'true' });

function leadHeaders(tenantId = 't'): Record<string, string> {
  return { 'x-iso-actor-uid': 'uid-lead', 'x-iso-tenant-id': tenantId, 'x-iso-role': 'leadAuditor', 'x-iso-platform': 'false' };
}

function makeReq(opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }): IncomingMessage {
  const iterator = (async function* () {
    if (opts.body !== undefined) yield Buffer.from(JSON.stringify(opts.body));
  })();
  const req: Record<string, unknown> = {
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {},
    [Symbol.asyncIterator]: () => iterator,
  };
  return req as unknown as IncomingMessage;
}

function makeRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: '',
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(chunk?: string) {
      res.body = chunk ?? '';
      return res;
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

function createFakeDb(): { db: Db; store: Map<string, Record<string, unknown>[]> } {
  const store = new Map<string, Record<string, unknown>[]>();
  const matches = (doc: Record<string, unknown>, query: Record<string, unknown>): boolean =>
    Object.keys(query).every((key) => doc[key] === query[key]);
  const collection = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    const docs = store.get(name)!;
    return {
      find(query: Record<string, unknown> = {}) {
        const result = docs.filter((doc) => matches(doc, query)).map((doc) => ({ ...doc }));
        return { sort: () => ({ toArray: async () => result }), toArray: async () => result };
      },
      async findOne(query: Record<string, unknown> = {}) {
        return docs.find((doc) => matches(doc, query)) ?? null;
      },
      async insertMany(items: Record<string, unknown>[]) {
        docs.push(...items.map((item) => ({ ...item })));
      },
      async insertOne(doc: Record<string, unknown>) {
        docs.push({ ...doc });
      },
      async updateOne(filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>, opts: { upsert?: boolean } = {}) {
        let doc = docs.find((entry) => matches(entry, filter));
        if (!doc && opts.upsert) {
          doc = { ...filter };
          docs.push(doc);
        }
        if (!doc) return;
        if (update['$set']) Object.assign(doc, update['$set']);
        if (update['$setOnInsert']) for (const k of Object.keys(update['$setOnInsert'])) if (!(k in doc)) doc[k] = update['$setOnInsert'][k];
        if (update['$addToSet']) {
          for (const k of Object.keys(update['$addToSet'])) {
            const list = Array.isArray(doc[k]) ? (doc[k] as unknown[]) : [];
            const value = update['$addToSet'][k];
            if (!list.includes(value)) list.push(value);
            doc[k] = list;
          }
        }
      },
    };
  };
  return { db: { collection } as unknown as Db, store };
}

async function call(db: Db, method: string, url: string, body?: unknown): Promise<ServerResponse & { statusCode: number; body: string }> {
  const res = makeRes();
  await handleApiRequest(makeReq({ method, url, headers: leadHeaders(), body }), res, { db, config });
  return res;
}

describe('lead-auditor end-to-end journey', () => {
  it('walks an audit from checklist to a signed report and reflects it in field-state', async () => {
    const { db } = createFakeDb();
    const A = '/api/tenants/t/audits/a';

    // Seed checklist + record a result.
    assert.equal((await call(db, 'GET', `${A}/field-state`)).statusCode, 200);
    assert.equal((await call(db, 'PUT', `${A}/checklist/item-9`, { result: 'majorNc', note: 'No evaluation of compliance' })).statusCode, 200);

    // Capture evidence, raise + grade a nonconformity, open a CAPA.
    assert.equal((await call(db, 'POST', `${A}/evidence`, { id: 'ev-1', kind: 'note', label: 'Interview: no 9.1.2 records', capturedByName: 'Lead', capturedAt: '2026-05-30T10:00:00.000Z' })).statusCode, 201);
    assert.equal((await call(db, 'PUT', `${A}/findings/nc-1`, {
      id: 'nc-1', clauseId: '9.1.2', clauseTitle: 'Evaluation of compliance', type: 'majorNc',
      description: 'No evaluation of compliance for the current cycle.', status: 'open', evidenceIds: ['ev-1'],
      createdByName: 'Lead', createdAt: '2026-05-30T10:05:00.000Z',
    })).statusCode, 200);
    assert.equal((await call(db, 'PUT', `${A}/capa/capa-1`, {
      id: 'capa-1', findingId: 'nc-1', action: 'Reinstate evaluation of compliance', owner: 'EHS', dueDate: '2026-07-01',
      implementationEvidenceIds: [], verificationEvidenceIds: [], status: 'inProgress', createdAt: '2026-05-30T10:06:00.000Z',
    })).statusCode, 200);

    // Populate one of each governance register (the clause-gap closures).
    assert.equal((await call(db, 'PUT', `${A}/management-reviews/mr-1`, { id: 'mr-1', inputs: 'audit results', decisions: 'reinstate evaluation', result: 'needsFollowUp' })).statusCode, 200);
    assert.equal((await call(db, 'PUT', `${A}/objectives/obj-1`, { id: 'obj-1', objective: 'Cut VOCs', progress: 'onTrack', result: 'conforming' })).statusCode, 200);

    // Save the report front-matter (must travel across devices via the backend).
    assert.equal((await call(db, 'PUT', `${A}/report-meta`, {
      auditType: 'stage2', scope: 'Denver plant OHSMS', objectives: 'Conformity + effectiveness',
      sites: '1 of 1', leadAuditorName: 'Maya Chen', auditorCompetence: 'IRCA Lead Auditor',
      impartialityDeclared: true, distribution: 'EHS; cert file', reportVersion: 2,
    })).statusCode, 200);

    // Record the conclusion and sign off (both lead-only).
    assert.equal((await call(db, 'PUT', `${A}/conclusion`, { overallConformity: 'Conforms with one major NC to close.', recommendation: 'conditional' })).statusCode, 200);
    const signed = await call(db, 'POST', `${A}/reports/signoff`, { attestation: 'I attest this audit was conducted per ISO 19011.' });
    assert.equal(signed.statusCode, 200);

    // Final field-state must reflect the whole journey.
    const state = await call(db, 'GET', `${A}/field-state`);
    const payload = JSON.parse(state.body) as Record<string, unknown[]> & {
      conclusion: { recommendation?: string } | null;
      reportMeta: { reportVersion?: number; leadAuditorName?: string } | null;
    };
    assert.equal(payload['findings'].length, 1);
    assert.equal(payload['capas'].length, 1);
    assert.equal(payload['managementReviews'].length, 1);
    assert.equal(payload['objectives'].length, 1);
    assert.equal(payload['evidence'].length, 1);
    assert.equal(payload.conclusion?.recommendation, 'conditional');
    assert.equal(payload.reportMeta?.reportVersion, 2);
    assert.equal(payload.reportMeta?.leadAuditorName, 'Maya Chen');
  });
});
