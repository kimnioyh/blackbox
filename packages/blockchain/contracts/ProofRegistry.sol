// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProofRegistry {
    address public immutable recorder;
    mapping(bytes32 => bytes32) private proofs;

    event ProofRecorded(bytes32 indexed caseId, bytes32 recordHash);

    constructor() {
        recorder = msg.sender;
    }

    function recordProof(bytes32 caseId, bytes32 recordHash) external {
        require(msg.sender == recorder, "Not recorder");
        require(caseId != bytes32(0) && recordHash != bytes32(0), "Empty proof");
        proofs[caseId] = recordHash;
        emit ProofRecorded(caseId, recordHash);
    }

    function getProof(bytes32 caseId) external view returns (bytes32) {
        return proofs[caseId];
    }
}
