import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const source = await readFile(new URL('../contracts/ProofRegistry.sol', import.meta.url), 'utf8');
const input = { language: 'Solidity', sources: { 'ProofRegistry.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
const result = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (result.errors ?? []).filter((item) => item.severity === 'error');
if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
const contract = result.contracts['ProofRegistry.sol'].ProofRegistry;
if (!contract?.evm?.bytecode?.object) throw new Error('ProofRegistry bytecode was not generated');

if (process.argv[2] === 'compile') {
  const path = new URL('../dist/ProofRegistry.json', import.meta.url);
  await mkdir(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true });
  await writeFile(path, JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2));
  process.stdout.write('ProofRegistry compiled to packages/blockchain/dist/ProofRegistry.json\n');
} else if (process.argv[2] === 'deploy') {
  const { CHAIN_RPC_URL, CHAIN_ID, BLOCKCHAIN_PRIVATE_KEY } = process.env;
  const missing = ['CHAIN_RPC_URL', 'CHAIN_ID', 'BLOCKCHAIN_PRIVATE_KEY'].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}`);
  if (Number(CHAIN_ID) !== sepolia.id) throw new Error('CHAIN_ID must be 11155111 for Sepolia');
  if (!/^0x[0-9a-fA-F]{64}$/.test(BLOCKCHAIN_PRIVATE_KEY)) throw new Error('BLOCKCHAIN_PRIVATE_KEY must be a 32-byte hex value');
  try {
    const publicClient = createPublicClient({ chain: sepolia, transport: http(CHAIN_RPC_URL) });
    if (await publicClient.getChainId() !== sepolia.id) throw new Error('RPC endpoint is not Sepolia');
    const account = privateKeyToAccount(BLOCKCHAIN_PRIVATE_KEY);
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(CHAIN_RPC_URL) });
    const txHash = await wallet.deployContract({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Contract deployment failed');
    process.stdout.write(JSON.stringify({ chainId: sepolia.id, contractAddress: receipt.contractAddress,
      txHash, blockNumber: receipt.blockNumber.toString() }, null, 2) + '\n');
  } catch {
    throw new Error('Sepolia deployment failed. Check RPC availability, signer balance, and transaction status.');
  }
} else {
  throw new Error('Usage: contract.mjs compile|deploy');
}
