import { z } from 'zod';

import { clauseRefSchema, isoEditionSchema } from './models';

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

export const sharedClauseTitles: StandardEdition[] = [
  {
    id: 'ISO_14001_2015',
    standard: 'ISO_14001',
    displayName: 'ISO 14001:2015',
    publishedAt: '2015-09-15',
    transitionEndsAt: '2029-04-30',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: [
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '4', title: 'Context of the organization', sortOrder: 400 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '5', title: 'Leadership', sortOrder: 500 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '6', title: 'Planning', sortOrder: 600 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '7', title: 'Support', sortOrder: 700 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '8', title: 'Operation', sortOrder: 800 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '9', title: 'Performance evaluation', sortOrder: 900 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2015', clauseId: '10', title: 'Improvement', sortOrder: 1000 },
    ],
  },
  {
    id: 'ISO_14001_2026',
    standard: 'ISO_14001',
    displayName: 'ISO 14001:2026',
    publishedAt: '2026-04-15',
    transitionEndsAt: '2029-04-30',
    copyrightNotice:
      'Clause identifiers and short titles only. Do not store ISO requirements text without confirmed licensing.',
    clauses: [
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '4', title: 'Context of the organization', sortOrder: 400 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '5', title: 'Leadership', sortOrder: 500 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '6', title: 'Planning', sortOrder: 600 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '7', title: 'Support', sortOrder: 700 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '8', title: 'Operation', sortOrder: 800 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '9', title: 'Performance evaluation', sortOrder: 900 },
      { standard: 'ISO_14001', edition: 'ISO_14001_2026', clauseId: '10', title: 'Improvement', sortOrder: 1000 },
    ],
  },
];
