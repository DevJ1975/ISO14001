import { z } from 'zod';

import { clauseRefSchema, isoEditionSchema } from './models.js';

export const standardClauseSchema = clauseRefSchema.extend({
  parentClauseId: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

export type StandardClause = z.infer<typeof standardClauseSchema>;

export const standardEditionSchema = z.object({
  id: isoEditionSchema,
  standard: z.literal('ISO_45001'),
  displayName: z.string().min(1),
  publishedAt: z.string().date(),
  transitionEndsAt: z.string().date().optional(),
  clauses: z.array(standardClauseSchema),
  copyrightNotice: z.string().min(1),
});

export type StandardEdition = z.infer<typeof standardEditionSchema>;

/**
 * Top-level clauses plus the principal sub-clauses, so findings can be
 * referenced precisely (e.g. 6.1.2, 8.1.2) the way real audit reports cite
 * them. Identifiers and short titles only — no requirement text — per the
 * copyright guardrail. The 2018 and 2026 editions share this high-level
 * structure (Annex SL), so the set is generated for each edition. OH&S-specific
 * clauses (5.4 worker consultation, 6.1.2 hazard identification, 8.1.2 hierarchy
 * of controls, 8.1.4 procurement, 10.2 incident) distinguish 45001 from 14001.
 */
const CLAUSE_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['4', 'Context of the organization'],
  ['4.1', 'Understanding the organization and its context'],
  ['4.2', 'Needs and expectations of workers and interested parties'],
  ['4.3', 'Scope of the OH&S management system'],
  ['4.4', 'OH&S management system'],
  ['5', 'Leadership and worker participation'],
  ['5.1', 'Leadership and commitment'],
  ['5.2', 'OH&S policy'],
  ['5.3', 'Roles, responsibilities and authorities'],
  ['5.4', 'Consultation and participation of workers'],
  ['6', 'Planning'],
  ['6.1', 'Actions to address risks and opportunities'],
  ['6.1.2', 'Hazard identification and assessment of risks and opportunities'],
  ['6.1.2.1', 'Hazard identification'],
  ['6.1.2.2', 'Assessment of OH&S risks and other risks'],
  ['6.1.3', 'Determination of legal requirements and other requirements'],
  ['6.1.4', 'Planning action'],
  ['6.2', 'OH&S objectives and planning to achieve them'],
  ['7', 'Support'],
  ['7.1', 'Resources'],
  ['7.2', 'Competence'],
  ['7.3', 'Awareness'],
  ['7.4', 'Communication'],
  ['7.5', 'Documented information'],
  ['8', 'Operation'],
  ['8.1', 'Operational planning and control'],
  ['8.1.2', 'Eliminating hazards and reducing OH&S risks'],
  ['8.1.3', 'Management of change'],
  ['8.1.4', 'Procurement'],
  ['8.2', 'Emergency preparedness and response'],
  ['9', 'Performance evaluation'],
  ['9.1', 'Monitoring, measurement, analysis and performance evaluation'],
  ['9.1.2', 'Evaluation of compliance'],
  ['9.2', 'Internal audit'],
  ['9.3', 'Management review'],
  ['10', 'Improvement'],
  ['10.2', 'Incident, nonconformity and corrective action'],
  ['10.3', 'Continual improvement'],
];

function clauseSet(edition: z.infer<typeof isoEditionSchema>): StandardClause[] {
  return CLAUSE_TITLES.map(([clauseId, title], index) => ({
    standard: 'ISO_45001' as const,
    edition,
    clauseId,
    title,
    sortOrder: (index + 1) * 10,
  }));
}

export const sharedClauseTitles: StandardEdition[] = [
  {
    id: 'ISO_45001_2018',
    standard: 'ISO_45001',
    displayName: 'ISO 45001:2018',
    publishedAt: '2018-03-12',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: clauseSet('ISO_45001_2018'),
  },
  {
    id: 'ISO_45001_2026',
    standard: 'ISO_45001',
    displayName: 'ISO 45001:2026',
    publishedAt: '2026-04-15',
    transitionEndsAt: '2029-04-30',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: clauseSet('ISO_45001_2026'),
  },
];
