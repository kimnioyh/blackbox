import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { caseIdHash, ProofChainClient } from '@blackbox/blockchain';
import { FinancialEventInputSchema } from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { caseEvidence, evidenceHash } from './evidence.js';

function chainConfig(requireSigner: boolean) {
  const missing = [
    ...(!process.env.CHAIN_RPC_URL ? ['CHAIN_RPC_URL'] : []),
    ...(!process.env.CHAIN_ID ? ['CHAIN_ID'] : []),
    ...(!process.env.PROOF_CONTRACT_ADDRESS ? ['PROOF_CONTRACT_ADDRESS'] : []),
    ...(requireSigner && !process.env.BLOCKCHAIN_PRIVATE_KEY ? ['BLOCKCHAIN_PRIVATE_KEY'] : []),
  ];
  if (missing.length) throw new ServiceUnavailableException({ code: 'CHAIN_CONFIG_MISSING', message: `Missing ${missing.join(', ')}` });
  const chainId = Number(process.env.CHAIN_ID);
  if (!Number.isInteger(chainId) || chainId !== 11155111 || !/^0x[0-9a-fA-F]{40}$/.test(process.env.PROOF_CONTRACT_ADDRESS!)) {
    throw new ServiceUnavailableException({ code: 'CHAIN_CONFIG_INVALID', message: 'Expected Sepolia chain ID and a deployed contract address' });
  }
  if (requireSigner && !/^0x[0-9a-fA-F]{64}$/.test(process.env.BLOCKCHAIN_PRIVATE_KEY!)) {
    throw new ServiceUnavailableException({ code: 'CHAIN_CONFIG_INVALID', message: 'BLOCKCHAIN_PRIVATE_KEY must be a 32-byte hex value' });
  }
  return { rpcUrl: process.env.CHAIN_RPC_URL!, chainId, contractAddress: process.env.PROOF_CONTRACT_ADDRESS! as `0x${string}`,
    privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY as `0x${string}` | undefined };
}

@Injectable()
export class ProofsService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  async create(caseId: string, key: string) {
    const eventKey = `proof:${key}`;
    const existing = await this.prisma.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
    if (existing) {
      const proofId = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload.proofId : null;
      if (existing.eventType !== 'PROOF_RECORDED' || typeof proofId !== 'string') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
      const proof = await this.prisma.blockchainProof.findUnique({ where: { id: proofId } });
      if (!proof) throw new ConflictException({ code: 'PROOF_EVENT_MISMATCH', message: 'Recorded proof event has no proof' });
      return this.serialize(proof);
    }
    const relatedCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const config = chainConfig(true);
    const last = await this.prisma.event.findFirst({ where: { caseId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const evidenceSequence = last?.sequence ?? 0;
    const snapshot = await caseEvidence(this.prisma, caseId, evidenceSequence);
    if (!snapshot) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const recordHash = evidenceHash(snapshot);
    let chainResult;
    try {
      chainResult = await new ProofChainClient(config).record(caseIdHash(caseId), recordHash);
    } catch {
      throw new ServiceUnavailableException({ code: 'CHAIN_WRITE_FAILED', message: 'Could not confirm a Sepolia proof transaction; inspect RPC, contract, signer balance and permissions' });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const repeated = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
          if (repeated) {
            const proofId = repeated.payload && typeof repeated.payload === 'object' && !Array.isArray(repeated.payload) ? repeated.payload.proofId : null;
            if (repeated.eventType !== 'PROOF_RECORDED' || typeof proofId !== 'string') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
            const proof = await tx.blockchainProof.findUnique({ where: { id: proofId } });
            if (!proof) throw new ConflictException({ code: 'PROOF_EVENT_MISMATCH', message: 'Recorded proof event has no proof' });
            return this.serialize(proof);
          }
          const proof = await tx.blockchainProof.create({ data: {
            caseId, evidenceSequence, recordHash, chainId: config.chainId,
            contractAddress: config.contractAddress, txHash: chainResult.txHash,
            blockNumber: chainResult.blockNumber, status: 'CONFIRMED', confirmedAt: new Date(),
          } });
          await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
            eventType: 'PROOF_RECORDED', actorType: 'SYSTEM', source: 'BLOCKCHAIN',
            verificationLevel: 'ON_CHAIN', occurredAt: new Date().toISOString(),
            payload: { proofId: proof.id, chainId: proof.chainId, recordHash, txHash: proof.txHash,
              blockNumber: proof.blockNumber!.toString() },
          }));
          const current = await tx.case.findUnique({ where: { id: caseId }, select: { status: true } });
          if (current && current.status !== 'BLOCKED' && current.status !== 'DISPUTED') {
            const payment = await tx.payment.findFirst({ where: { caseId, status: 'SUCCESS' }, select: { id: true } });
            if (payment) await tx.case.update({ where: { id: caseId }, data: { status: 'VERIFIED' } });
          }
          return this.serialize(proof);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'PROOF_PERSIST_FAILED', message: 'Sepolia transaction confirmed but local proof persistence needs reconciliation' });
  }

  async verify(caseId: string) {
    const relatedCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const proof = await this.prisma.blockchainProof.findFirst({ where: { caseId }, orderBy: { createdAt: 'desc' } });
    if (!proof) throw new NotFoundException({ code: 'PROOF_NOT_FOUND', message: 'No proof exists for this case' });
    const snapshot = await caseEvidence(this.prisma, caseId, proof.evidenceSequence);
    if (!snapshot) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const currentRecordHash = evidenceHash(snapshot);
    const config = chainConfig(false);
    if (config.chainId !== proof.chainId || config.contractAddress.toLowerCase() !== proof.contractAddress.toLowerCase()) {
      throw new ServiceUnavailableException({ code: 'CHAIN_CONFIG_MISMATCH', message: 'Current chain configuration differs from the stored proof' });
    }
    let onChainHash;
    try { onChainHash = await new ProofChainClient(config).read(caseIdHash(caseId)); }
    catch { throw new ServiceUnavailableException({ code: 'CHAIN_READ_FAILED', message: 'Could not read the Sepolia proof' }); }
    return {
      verified: currentRecordHash === proof.recordHash && onChainHash === proof.recordHash,
      currentRecordHash, recordHash: proof.recordHash, onChainHash,
      evidenceSequence: proof.evidenceSequence, chainId: proof.chainId,
      contractAddress: proof.contractAddress, txHash: proof.txHash,
    };
  }

  private serialize(proof: { recordHash: string; chainId: number; contractAddress: string; txHash: string; blockNumber: bigint | null; status: string; evidenceSequence: number }) {
    return { recordHash: proof.recordHash, chainId: proof.chainId, contractAddress: proof.contractAddress,
      txHash: proof.txHash, blockNumber: proof.blockNumber?.toString() ?? null,
      status: proof.status, evidenceSequence: proof.evidenceSequence };
  }
}
