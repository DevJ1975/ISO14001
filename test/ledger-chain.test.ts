import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GENESIS_PREV_HASH,
  buildLedgerChain,
  buildLedgerChainExport,
  ledgerHeadHash,
  verifyLedgerChain,
  type ChainedLedgerEntry,
  type LedgerEntryInput,
} from '../src/app/core/domain';

const entries = (): LedgerEntryInput[] => [
  { id: 'c1', actorUid: 'u1', action: 'create', target: 'finding', targetId: 'f1', at: '2026-06-01T09:00:00.000Z' },
  { id: 'c2', actorUid: 'u2', action: 'update', target: 'finding', targetId: 'f1', at: '2026-06-01T10:00:00.000Z' },
  { id: 'c3', actorUid: 'u1', action: 'sign', target: 'report', at: '2026-06-02T08:30:00.000Z' },
];

describe('ledger hash-chain (build)', () => {
  it('annotates each entry with sequential seq, prevHash linkage and a 64-hex hash', async () => {
    const chain = await buildLedgerChain(entries());
    assert.equal(chain.length, 3);
    assert.equal(chain[0]!.seq, 0);
    assert.equal(chain[0]!.prevHash, GENESIS_PREV_HASH);
    for (const entry of chain) {
      assert.match(entry.hash, /^[0-9a-f]{64}$/);
    }
    // Each entry's prevHash equals the previous entry's hash.
    assert.equal(chain[1]!.prevHash, chain[0]!.hash);
    assert.equal(chain[2]!.prevHash, chain[1]!.hash);
  });

  it('is deterministic for identical input', async () => {
    const a = await buildLedgerChain(entries());
    const b = await buildLedgerChain(entries());
    assert.deepEqual(a, b);
  });

  it('handles empty input safely (genesis)', async () => {
    const chain = await buildLedgerChain([]);
    assert.deepEqual(chain, []);
    assert.equal(ledgerHeadHash(chain), GENESIS_PREV_HASH);
  });

  it('changes the head hash when any entry content changes', async () => {
    const original = ledgerHeadHash(await buildLedgerChain(entries()));
    const mutated = entries();
    mutated[0]!.action = 'delete';
    const after = ledgerHeadHash(await buildLedgerChain(mutated));
    assert.notEqual(original, after);
  });
});

describe('ledger hash-chain (verify)', () => {
  it('accepts an intact chain', async () => {
    const chain = await buildLedgerChain(entries());
    assert.deepEqual(await verifyLedgerChain(chain), { ok: true });
  });

  it('accepts an empty chain', async () => {
    assert.deepEqual(await verifyLedgerChain([]), { ok: true });
  });

  it('detects an altered entry at the right index', async () => {
    const chain = await buildLedgerChain(entries());
    // Tamper with the payload of the middle entry without re-chaining.
    const tampered: ChainedLedgerEntry[] = chain.map((e) => ({ ...e }));
    tampered[1]!.action = 'forged';
    assert.deepEqual(await verifyLedgerChain(tampered), { ok: false, brokenAt: 1 });
  });

  it('detects a removed entry', async () => {
    const chain = await buildLedgerChain(entries());
    // Drop the middle entry: entry now at index 1 still claims seq 2 / old prevHash.
    const removed = [chain[0]!, chain[2]!];
    const result = await verifyLedgerChain(removed);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAt, 1);
  });

  it('detects a reordered chain', async () => {
    const chain = await buildLedgerChain(entries());
    const reordered = [chain[1]!, chain[0]!, chain[2]!];
    const result = await verifyLedgerChain(reordered);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAt, 0);
  });
});

describe('ledger chain export', () => {
  it('carries the head hash, length and entries for external re-verification', async () => {
    const chain = await buildLedgerChain(entries());
    const doc = buildLedgerChainExport('Northstar Components', chain, '2026-06-04T00:00:00.000Z');
    assert.equal(doc.length, 3);
    assert.equal(doc.headHash, ledgerHeadHash(chain));
    assert.equal(doc.algorithm, 'SHA-256');
    assert.equal(doc.generatedAt, '2026-06-04T00:00:00.000Z');
    assert.equal(doc.auditee, 'Northstar Components');
    // The exported chain re-verifies on its own.
    assert.deepEqual(await verifyLedgerChain(doc.entries), { ok: true });
  });

  it('exports an empty trail with the genesis head', async () => {
    const doc = buildLedgerChainExport('Acme', await buildLedgerChain([]), '2026-06-04T00:00:00.000Z');
    assert.equal(doc.length, 0);
    assert.equal(doc.headHash, GENESIS_PREV_HASH);
  });
});
