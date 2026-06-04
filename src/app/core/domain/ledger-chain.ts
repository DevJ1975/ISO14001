/**
 * Tamper-evident hash-chain over the audit change-log / activity ledger (ISO 45001
 * cl. 7.5 control of documented information; ISO 19011 records). The change-log is
 * already an immutable, ordered audit trail; this module hardens it into a chain
 * where each entry's hash folds in the previous entry's hash. Altering, removing or
 * reordering any entry breaks every hash from that point on, so a single
 * verification pass can prove the whole trail is intact (or pinpoint where it broke).
 *
 * Pure and deterministic — no I/O, no store/DOM access. It reuses the SAME SHA-256
 * primitive (`sha256Hex`) the report e-signature uses, so there is one hashing
 * boundary across the platform and no new crypto dependency. Like report-draft.ts
 * and working-papers.ts, the chain math lives here so it can be unit-tested and
 * reproduced from the store's signals.
 */

import { sha256Hex } from './ohs-signature.js';

/** Chain canonicalisation version, mirrored into each entry's hash via the `v1` prefix. */
export const LEDGER_CHAIN_VERSION = 1 as const;

/** Genesis previous-hash for the first entry (no predecessor). */
export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * The minimal, order-stable view of one change-log entry the chain attests to.
 * Matches the store's `ChangeLogEntry` shape; kept local so the chain stays
 * decoupled from the store (mirrors working-papers' `*Like` shapes).
 */
export interface LedgerEntryInput {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  targetId?: string;
  at: string;
}

/** One entry annotated with its position and chain hashes. */
export interface ChainedLedgerEntry extends LedgerEntryInput {
  /** 0-based position in the chain. */
  seq: number;
  /** Hash of the previous entry (`GENESIS_PREV_HASH` for `seq === 0`). */
  prevHash: string;
  /** SHA-256 hex of this entry's canonical content folded with `prevHash`. */
  hash: string;
}

/** Result of verifying a chain: `ok`, plus the `seq` of the first broken link when not. */
export interface LedgerChainVerification {
  ok: boolean;
  /** 0-based index of the first entry whose hash does not reconcile, when `ok` is false. */
  brokenAt?: number;
}

const FIELD_SEP = '␟'; // ␟
const RECORD_SEP = '‖'; // ‖

/**
 * Build the canonical string hashed for one entry. Field-ordered and version-tagged
 * so the same entry + predecessor always yields the same digest regardless of object
 * key order. The previous hash is folded in, which is what chains the entries.
 */
export function canonicalLedgerEntry(entry: LedgerEntryInput, seq: number, prevHash: string): string {
  return [
    `v${LEDGER_CHAIN_VERSION}`,
    String(seq),
    prevHash,
    (entry.id ?? '').trim(),
    (entry.actorUid ?? '').trim(),
    (entry.action ?? '').trim(),
    (entry.target ?? '').trim(),
    (entry.targetId ?? '').trim(),
    (entry.at ?? '').trim(),
  ].join(FIELD_SEP) + RECORD_SEP;
}

/** Compute one entry's chain hash from its content and the previous hash. */
export function ledgerEntryHash(entry: LedgerEntryInput, seq: number, prevHash: string): Promise<string> {
  return sha256Hex(canonicalLedgerEntry(entry, seq, prevHash));
}

/**
 * Build the hash-chain over the ordered change-log entries. Each entry is annotated
 * with `seq`, `prevHash` (the genesis constant for the first) and `hash` (which folds
 * in `prevHash`). The input order is taken as authoritative — the store's change-log
 * is already insertion/timestamp-ordered — and is preserved. Empty input yields `[]`.
 */
export async function buildLedgerChain(entries: readonly LedgerEntryInput[]): Promise<ChainedLedgerEntry[]> {
  const chained: ChainedLedgerEntry[] = [];
  let prevHash = GENESIS_PREV_HASH;
  for (let seq = 0; seq < entries.length; seq++) {
    const entry = entries[seq]!;
    const hash = await ledgerEntryHash(entry, seq, prevHash);
    chained.push({
      id: entry.id,
      actorUid: entry.actorUid,
      action: entry.action,
      target: entry.target,
      targetId: entry.targetId,
      at: entry.at,
      seq,
      prevHash,
      hash,
    });
    prevHash = hash;
  }
  return chained;
}

/**
 * Verify a previously built chain by recomputing each entry's hash from its content
 * and the running previous hash, and checking the recorded `seq`/`prevHash` linkage.
 * Detects any altered, removed or reordered entry. Returns `{ ok: true }` for an
 * intact (or empty) chain, otherwise `{ ok: false, brokenAt }` at the first bad link.
 */
export async function verifyLedgerChain(
  chained: readonly ChainedLedgerEntry[],
): Promise<LedgerChainVerification> {
  let prevHash = GENESIS_PREV_HASH;
  for (let seq = 0; seq < chained.length; seq++) {
    const entry = chained[seq]!;
    // Position and linkage must match what the chain claims.
    if (entry.seq !== seq || entry.prevHash !== prevHash) {
      return { ok: false, brokenAt: seq };
    }
    const expected = await ledgerEntryHash(entry, seq, prevHash);
    if (expected !== entry.hash) {
      return { ok: false, brokenAt: seq };
    }
    prevHash = entry.hash;
  }
  return { ok: true };
}

/** The head (most recent) hash of a chain — the single fingerprint that fixes the whole trail. */
export function ledgerHeadHash(chained: readonly ChainedLedgerEntry[]): string {
  return chained.length ? chained[chained.length - 1]!.hash : GENESIS_PREV_HASH;
}

/** Schema version of the exported audit-trail document. Bump on any breaking shape change. */
export const LEDGER_EXPORT_VERSION = 1 as const;

/** Self-contained, JSON-serialisable export of the chained audit trail for external re-verification. */
export interface LedgerChainExport {
  version: typeof LEDGER_EXPORT_VERSION;
  chainVersion: typeof LEDGER_CHAIN_VERSION;
  algorithm: 'SHA-256';
  generatedAt: string;
  auditee: string;
  /** Number of entries in the chain. */
  length: number;
  /** Head hash — an external party recomputes the chain and compares this. */
  headHash: string;
  entries: ChainedLedgerEntry[];
}

/**
 * Assemble the export document for a built chain. Pure: pass `generatedAt` to make
 * it reproducible in tests. Carries the head hash so a recipient can re-verify the
 * trail offline with `verifyLedgerChain` and compare the head.
 */
export function buildLedgerChainExport(
  auditee: string,
  chained: ChainedLedgerEntry[],
  generatedAt: string = new Date().toISOString(),
): LedgerChainExport {
  return {
    version: LEDGER_EXPORT_VERSION,
    chainVersion: LEDGER_CHAIN_VERSION,
    algorithm: 'SHA-256',
    generatedAt,
    auditee,
    length: chained.length,
    headHash: ledgerHeadHash(chained),
    entries: chained,
  };
}
