import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { proofRegistryAbi } from './abi.js';

export type ProofChainConfig = {
  rpcUrl: string;
  chainId: number;
  contractAddress: `0x${string}`;
  privateKey?: Hex;
};

export class ProofChainClient {
  private readonly publicClient;
  constructor(private readonly config: ProofChainConfig) {
    if (config.chainId !== sepolia.id) throw new Error('Only Sepolia is configured for this MVP');
    this.publicClient = createPublicClient({ chain: sepolia, transport: http(config.rpcUrl, { timeout: 20_000 }) });
  }

  private async assertChain() {
    const actual = await this.publicClient.getChainId();
    if (actual !== this.config.chainId) throw new Error(`RPC chain mismatch: expected ${this.config.chainId}, received ${actual}`);
  }

  async record(caseHash: Hex, recordHash: Hex) {
    if (!this.config.privateKey) throw new Error('BLOCKCHAIN_PRIVATE_KEY is required to record a proof');
    await this.assertChain();
    const account = privateKeyToAccount(this.config.privateKey);
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(this.config.rpcUrl, { timeout: 20_000 }) });
    const { request } = await this.publicClient.simulateContract({
      address: this.config.contractAddress, abi: proofRegistryAbi, functionName: 'recordProof',
      args: [caseHash, recordHash], account,
    });
    const txHash = await wallet.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error(`Proof transaction reverted: ${txHash}`);
    return { txHash, blockNumber: receipt.blockNumber };
  }

  async read(caseHash: Hex) {
    await this.assertChain();
    return this.publicClient.readContract({
      address: this.config.contractAddress, abi: proofRegistryAbi, functionName: 'getProof', args: [caseHash],
    });
  }
}
