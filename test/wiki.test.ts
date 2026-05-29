import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const wikiRoot = join(process.cwd(), 'docs', 'wiki');
const implementationManual = join(wikiRoot, 'auditor-implementation-manual.md');
const trainingManual = join(wikiRoot, 'auditor-training-manual.md');

describe('auditor wiki', () => {
  it('includes generated implementation and training manuals', () => {
    assert.equal(existsSync(implementationManual), true);
    assert.equal(existsSync(trainingManual), true);
  });

  it('keeps the ISO copyright guardrail visible in the wiki index', () => {
    const index = readFileSync(join(wikiRoot, 'README.md'), 'utf8');
    assert.match(index, /do not reproduce ISO standard requirements text/i);
  });

  it('trains auditors on photo evidence and AI review', () => {
    const training = readFileSync(trainingManual, 'utf8');
    assert.match(training, /Taking Picture Evidence/);
    assert.match(training, /AI Image Identification/);
    assert.match(training, /review/i);
  });

  it('covers tenant rollout implementation checks', () => {
    const implementation = readFileSync(implementationManual, 'utf8');
    assert.match(implementation, /Tenant Setup/);
    assert.match(implementation, /Photo Evidence Implementation/);
    assert.match(implementation, /Go-Live Checklist/);
  });
});
