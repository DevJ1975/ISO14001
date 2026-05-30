import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadServerConfig } from '../server/config';

const base = { MONGODB_URI: 'mongodb://localhost:27017' };

describe('server config', () => {
  it('parses ALLOW_DEV_AUTH_HEADERS=false as false (not a truthy string)', () => {
    const config = loadServerConfig({ ...base, ALLOW_DEV_AUTH_HEADERS: 'false' });
    assert.equal(config.allowDevAuthHeaders, false);
  });

  it('parses ALLOW_DEV_AUTH_HEADERS=true as true', () => {
    const config = loadServerConfig({ ...base, ALLOW_DEV_AUTH_HEADERS: 'true' });
    assert.equal(config.allowDevAuthHeaders, true);
  });

  it('defaults dev auth headers off when unset', () => {
    const config = loadServerConfig({ ...base });
    assert.equal(config.allowDevAuthHeaders, false);
  });
});
