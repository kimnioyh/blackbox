import { keccak256, stringToHex } from 'viem';

/** Stable JSON encoding for evidence hashes. JSON-only values; object keys are sorted recursively. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function hashCanonical(value: unknown): `0x${string}` {
  return keccak256(stringToHex(canonicalJson(value)));
}

/** Only this opaque digest and the evidence digest are sent to the public chain. */
export function caseIdHash(caseId: string): `0x${string}` {
  return keccak256(stringToHex(caseId));
}

export { proofRegistryAbi } from './abi.js';
export { ProofChainClient, type ProofChainConfig } from './proof-client.js';
