import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseIdHash, canonicalJson, hashCanonical, proofRegistryAbi } from './index.js';

test('canonical evidence hash ignores JSON object insertion order', () => {
  const left = { caseId: 'case-1', evidence: { amount: '32.00', merchant: 'Amazon' } };
  const right = { evidence: { merchant: 'Amazon', amount: '32.00' }, caseId: 'case-1' };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashCanonical(left), hashCanonical(right));
  assert.notEqual(hashCanonical(left), hashCanonical({ ...left, evidence: { amount: '33.00', merchant: 'Amazon' } }));
});

test('registry interface accepts only opaque bytes32 identifiers and hashes', () => {
  assert.match(caseIdHash('case-1'), /^0x[0-9a-f]{64}$/);
  assert.notEqual(caseIdHash('case-1'), caseIdHash('case-2'));
  const record = proofRegistryAbi.find((entry) => entry.name === 'recordProof');
  const read = proofRegistryAbi.find((entry) => entry.name === 'getProof');
  assert.deepEqual(record?.inputs.map((input) => input.type), ['bytes32', 'bytes32']);
  assert.deepEqual(read?.inputs.map((input) => input.type), ['bytes32']);
});
