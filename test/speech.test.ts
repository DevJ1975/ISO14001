import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeTranscript } from '../src/app/core/speech/speech.service';

describe('mergeTranscript', () => {
  it('capitalises the first dictation into an empty note', () => {
    assert.equal(mergeTranscript('', 'fire exit was blocked'), 'Fire exit was blocked');
  });

  it('returns the existing note unchanged when the addition is blank', () => {
    assert.equal(mergeTranscript('Existing note', '   '), 'Existing note');
  });

  it('appends mid-sentence without forcing capitalisation', () => {
    assert.equal(
      mergeTranscript('The guard was', 'not in place'),
      'The guard was not in place',
    );
  });

  it('capitalises a new sentence after terminal punctuation', () => {
    assert.equal(
      mergeTranscript('Door was open.', 'no signage present'),
      'Door was open. No signage present',
    );
  });

  it('collapses trailing whitespace on the existing note before joining', () => {
    assert.equal(mergeTranscript('Note here   ', 'continued'), 'Note here continued');
  });

  it('trims the dictated fragment', () => {
    assert.equal(mergeTranscript('', '  hello  '), 'Hello');
  });
});
