export const proofRegistryAbi = [
  { type: 'function', name: 'recordProof', stateMutability: 'nonpayable',
    inputs: [{ name: 'caseId', type: 'bytes32' }, { name: 'recordHash', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'getProof', stateMutability: 'view',
    inputs: [{ name: 'caseId', type: 'bytes32' }], outputs: [{ type: 'bytes32' }] },
] as const;
