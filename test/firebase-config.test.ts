import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { firebaseConfig, firebaseProjectId } from '../src/app/core/firebase/firebase.config';

describe('firebase config', () => {
  it('points the web client at the auditor Firebase project', () => {
    assert.equal(firebaseProjectId, 'auditor-ece22');
    assert.equal(firebaseConfig.authDomain, 'auditor-ece22.firebaseapp.com');
    assert.equal(firebaseConfig.storageBucket, 'auditor-ece22.firebasestorage.app');
  });

  it('includes analytics measurement configuration', () => {
    assert.equal(firebaseConfig.measurementId, 'G-GR6PFR89PM');
  });
});
