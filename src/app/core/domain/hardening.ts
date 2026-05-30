import { z } from 'zod';

import { timestampSchema } from './models.js';

export const hardeningAreaSchema = z.enum([
  'tenantIsolation',
  'securityRules',
  'offlineSync',
  'accessibility',
  'observability',
  'deployment',
  'pilotReadiness',
]);

export const hardeningStatusSchema = z.enum(['notStarted', 'planned', 'inProgress', 'passing', 'blocked']);

export const hardeningControlSchema = z.object({
  id: z.string().min(1),
  area: hardeningAreaSchema,
  title: z.string().min(1),
  owner: z.string().min(1),
  status: hardeningStatusSchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});

export type HardeningControl = z.infer<typeof hardeningControlSchema>;

export const securityProbeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  actorUid: z.string().min(1),
  attemptedPath: z.string().min(1),
  expectedDecision: z.enum(['allow', 'deny']),
  actualDecision: z.enum(['allow', 'deny']).optional(),
  status: z.enum(['queued', 'passed', 'failed']),
});

export type SecurityProbe = z.infer<typeof securityProbeSchema>;

export const accessibilityCheckSchema = z.object({
  id: z.string().min(1),
  flow: z.string().min(1),
  criterion: z.string().min(1),
  status: hardeningStatusSchema,
  notes: z.string().max(1000).optional(),
});

export type AccessibilityCheck = z.infer<typeof accessibilityCheckSchema>;

export const observabilityEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1).optional(),
  eventType: z.enum([
    'auth.claimsChanged',
    'audit.offlineSyncConflict',
    'evidence.uploadFailed',
    'ai.reviewCompleted',
    'report.signed',
    'capa.reminderFailed',
  ]),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  occurredAt: timestampSchema,
  actorUid: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type ObservabilityEvent = z.infer<typeof observabilityEventSchema>;

export const pilotChecklistItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  area: hardeningAreaSchema,
  requiredForPilot: z.boolean(),
  status: hardeningStatusSchema,
  exitCriteria: z.string().min(1),
});

export type PilotChecklistItem = z.infer<typeof pilotChecklistItemSchema>;

export function isPilotReady(items: PilotChecklistItem[]): boolean {
  return items.every((item) => !item.requiredForPilot || item.status === 'passing');
}

export function summarizeHardeningControls(controls: HardeningControl[]): Record<z.infer<typeof hardeningAreaSchema>, number> {
  return controls.reduce(
    (summary, control) => ({
      ...summary,
      [control.area]: summary[control.area] + 1,
    }),
    {
      tenantIsolation: 0,
      securityRules: 0,
      offlineSync: 0,
      accessibility: 0,
      observability: 0,
      deployment: 0,
      pilotReadiness: 0,
    },
  );
}
