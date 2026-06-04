import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AUDITOR_MANUAL, auditorManualSectionIds } from '../src/app/core/domain';

/** The top-level sections the auditor's manual is expected to cover. */
const EXPECTED_SECTION_IDS = [
  'principles',
  'lifecycle-initiation',
  'lifecycle-preparation',
  'conduct-onsite',
  'reporting',
  'capa',
  'competence',
  'registers',
  'field-working',
  'glossary',
];

/** Walk every string the manual renders, for whole-content assertions. */
function allText(): string[] {
  const out: string[] = [];
  for (const section of AUDITOR_MANUAL) {
    out.push(section.id, section.title, section.icon, section.intro);
    for (const sub of section.subsections) {
      out.push(sub.heading);
      for (const block of sub.blocks) {
        if (block.text !== undefined) out.push(block.text);
        for (const item of block.items ?? []) out.push(item);
      }
    }
  }
  return out;
}

test('manual exposes the expected top-level sections', () => {
  const ids = auditorManualSectionIds();
  for (const expected of EXPECTED_SECTION_IDS) {
    assert.ok(ids.includes(expected), `missing manual section "${expected}"`);
  }
  assert.equal(ids.length, EXPECTED_SECTION_IDS.length, 'unexpected number of top-level sections');
});

test('section ids are unique', () => {
  const ids = auditorManualSectionIds();
  assert.equal(new Set(ids).size, ids.length, 'section ids must be unique');
});

test('every section has a title, icon, intro and at least one subsection', () => {
  for (const section of AUDITOR_MANUAL) {
    assert.ok(section.title.trim().length > 0, `section ${section.id} has no title`);
    assert.ok(section.icon.trim().length > 0, `section ${section.id} has no icon`);
    assert.ok(section.intro.trim().length > 0, `section ${section.id} has no intro`);
    assert.ok(section.subsections.length > 0, `section ${section.id} has no subsections`);
  }
});

test('every subsection has a heading and non-empty content blocks', () => {
  for (const section of AUDITOR_MANUAL) {
    for (const sub of section.subsections) {
      assert.ok(sub.heading.trim().length > 0, `section ${section.id} has a subsection with no heading`);
      assert.ok(sub.blocks.length > 0, `subsection "${sub.heading}" has no content blocks`);
      for (const block of sub.blocks) {
        if (block.kind === 'p') {
          assert.ok((block.text ?? '').trim().length > 0, `paragraph in "${sub.heading}" is empty`);
        } else {
          assert.ok((block.items ?? []).length > 0, `list in "${sub.heading}" has no items`);
          for (const item of block.items ?? []) {
            assert.ok(item.trim().length > 0, `list in "${sub.heading}" has an empty item`);
          }
        }
      }
    }
  }
});

test('copyright guardrail: manual carries no verbatim ISO requirement text', () => {
  // The manual is original guidance; "shall" is the hallmark of ISO requirement
  // text, so it must never appear anywhere in the manual content.
  for (const text of allText()) {
    assert.ok(!/\bshall\b/i.test(text), `manual text appears to quote requirement text: "${text}"`);
  }
});
