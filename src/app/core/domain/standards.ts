import { z } from 'zod';

import { clauseRefSchema, isoEditionSchema } from './models.js';

export const standardClauseSchema = clauseRefSchema.extend({
  parentClauseId: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

export type StandardClause = z.infer<typeof standardClauseSchema>;

export const standardEditionSchema = z.object({
  id: isoEditionSchema,
  standard: z.literal('ISO_14001'),
  displayName: z.string().min(1),
  publishedAt: z.string().date(),
  transitionEndsAt: z.string().date().optional(),
  clauses: z.array(standardClauseSchema),
  copyrightNotice: z.string().min(1),
});

export type StandardEdition = z.infer<typeof standardEditionSchema>;

/**
 * Top-level clauses plus the principal sub-clauses, so findings can be
 * referenced precisely (e.g. 6.1.2, 9.1.2) the way real audit reports cite
 * them. Identifiers and short titles only — no requirement text — per the
 * copyright guardrail. The 2015 and 2026 editions share this high-level
 * structure (Annex SL), so the set is generated for each edition.
 */
const CLAUSE_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['4', 'Context of the organization'],
  ['4.1', 'Understanding the organization and its context'],
  ['4.2', 'Needs and expectations of interested parties'],
  ['4.3', 'Scope of the environmental management system'],
  ['4.4', 'Environmental management system'],
  ['5', 'Leadership'],
  ['5.1', 'Leadership and commitment'],
  ['5.2', 'Environmental policy'],
  ['5.3', 'Roles, responsibilities and authorities'],
  ['6', 'Planning'],
  ['6.1', 'Actions to address risks and opportunities'],
  ['6.1.2', 'Environmental aspects'],
  ['6.1.3', 'Compliance obligations'],
  ['6.2', 'Environmental objectives and planning'],
  ['7', 'Support'],
  ['7.1', 'Resources'],
  ['7.2', 'Competence'],
  ['7.3', 'Awareness'],
  ['7.4', 'Communication'],
  ['7.5', 'Documented information'],
  ['8', 'Operation'],
  ['8.1', 'Operational planning and control'],
  ['8.2', 'Emergency preparedness and response'],
  ['9', 'Performance evaluation'],
  ['9.1', 'Monitoring, measurement, analysis and evaluation'],
  ['9.1.2', 'Evaluation of compliance'],
  ['9.2', 'Internal audit'],
  ['9.3', 'Management review'],
  ['10', 'Improvement'],
  ['10.2', 'Nonconformity and corrective action'],
  ['10.3', 'Continual improvement'],
];

function clauseSet(edition: z.infer<typeof isoEditionSchema>): StandardClause[] {
  return CLAUSE_TITLES.map(([clauseId, title], index) => ({
    standard: 'ISO_14001' as const,
    edition,
    clauseId,
    title,
    sortOrder: (index + 1) * 10,
  }));
}

export const sharedClauseTitles: StandardEdition[] = [
  {
    id: 'ISO_14001_2015',
    standard: 'ISO_14001',
    displayName: 'ISO 14001:2015',
    publishedAt: '2015-09-15',
    transitionEndsAt: '2029-04-30',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: clauseSet('ISO_14001_2015'),
  },
  {
    id: 'ISO_14001_2026',
    standard: 'ISO_14001',
    displayName: 'ISO 14001:2026',
    publishedAt: '2026-04-15',
    transitionEndsAt: '2029-04-30',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: clauseSet('ISO_14001_2026'),
  },
];
