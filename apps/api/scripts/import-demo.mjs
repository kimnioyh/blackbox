import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const data = JSON.parse(await readFile(new URL('../prisma/demo-data.json', import.meta.url), 'utf8'));
if (data.format !== 'blackbox-demo-v1' || data.cases?.length !== 3 || data.blockchainProofs?.length !== 2) {
  throw new Error('Unexpected demo fixture format');
}

function withDates(rows, fields) {
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of fields) if (copy[field] !== null && copy[field] !== undefined) copy[field] = new Date(copy[field]);
    return copy;
  });
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  if (await prisma.case.count() !== 0) throw new Error('Demo import requires an empty Case table; no data changed');
  await prisma.$transaction(async (tx) => {
    await tx.case.createMany({ data: withDates(data.cases, ['createdAt', 'updatedAt', 'closedAt']) });
    await tx.policy.createMany({ data: withDates(data.policies, ['deadline', 'createdAt']) });
    await tx.approval.createMany({ data: withDates(data.approvals, ['createdAt']) });
    await tx.payment.createMany({ data: withDates(data.payments, ['executedAt', 'createdAt']) });
    await tx.auditResult.createMany({ data: withDates(data.auditResults, ['createdAt']) });
    await tx.blockchainProof.createMany({ data: withDates(data.blockchainProofs, ['createdAt', 'confirmedAt'])
      .map((row) => ({ ...row, blockNumber: row.blockNumber === null ? null : BigInt(row.blockNumber) })) });
    await tx.modelInvocation.createMany({ data: withDates(data.modelInvocations, ['createdAt']) });
    await tx.event.createMany({ data: withDates(data.events, ['occurredAt', 'receivedAt']) });
  });
  process.stdout.write(JSON.stringify({ importedCases: data.cases.length, importedEvents: data.events.length,
    importedProofs: data.blockchainProofs.length }) + '\n');
} finally {
  await prisma.$disconnect();
}
