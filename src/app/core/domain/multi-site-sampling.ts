/**
 * Multi-site sampling for certification audits, following the √N methodology of
 * IAF MD 1 (Audit and Certification of a Management System Operated by a
 * Multi-Site Organisation): the sample size is the square root of the number of
 * sites, rounded up — reduced for surveillance and recertification. References
 * IAF MD 1 by number/title only; contains no quoted text.
 */

import type { CertificationStage } from './audit-time.js';

/** √N factor by stage: initial = √N; surveillance ≈ 0.6√N; recert ≈ 0.8√N. */
const STAGE_SAMPLE_FACTOR: Record<CertificationStage, number> = {
  initial: 1,
  surveillance: 0.6,
  recertification: 0.8,
};

/** Number of sites to sample for a given site count and stage (⌈factor·√N⌉). */
export function sampleSiteCount(siteCount: number, stage: CertificationStage = 'initial'): number {
  const sites = Math.max(0, Math.floor(siteCount));
  if (sites <= 1) return sites;
  return Math.max(1, Math.ceil(Math.sqrt(sites) * STAGE_SAMPLE_FACTOR[stage]));
}

export interface SiteSampleResult<T> {
  sampled: T[];
  count: number;
  rationale: string;
}

/**
 * Select a representative spread of sites: the central function / head office
 * (first entry) plus an even spread across the remainder, so the sample is not
 * clustered. Deterministic, so the plan is reproducible.
 */
export function selectSampleSites<T>(sites: T[], stage: CertificationStage = 'initial'): SiteSampleResult<T> {
  const count = sampleSiteCount(sites.length, stage);
  if (count >= sites.length) {
    return { sampled: [...sites], count: sites.length, rationale: 'All sites sampled (sample size ≥ site count).' };
  }
  const indices = new Set<number>([0]); // always include the first (e.g. HQ / central function)
  const step = sites.length / count;
  for (let i = 1; indices.size < count; i += 1) {
    indices.add(Math.min(sites.length - 1, Math.round(i * step)));
    if (i > sites.length) break; // safety
  }
  const sampled = [...indices].sort((a, b) => a - b).slice(0, count).map((index) => sites[index]);
  return {
    sampled,
    count,
    rationale: `√N sampling (${stage}): ⌈${STAGE_SAMPLE_FACTOR[stage]}·√${sites.length}⌉ = ${count} of ${sites.length} sites, central function plus an even spread.`,
  };
}
