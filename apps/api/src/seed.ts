import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {}, create: { email: 'demo@example.com', name: 'Demo User' },
  });
  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-organization' },
    update: {}, create: { slug: 'demo-organization', name: 'Demo Organization' },
  });
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: {}, create: { userId: user.id, organizationId: organization.id, role: 'OWNER' },
  });
  const agent = await prisma.agent.findFirst({ where: { organizationId: organization.id, externalAgentId: 'demo-shopping-agent' } })
    ?? await prisma.agent.create({ data: { organizationId: organization.id, name: 'Demo Shopping Agent', externalAgentId: 'demo-shopping-agent' } });
  process.stdout.write(JSON.stringify({ userId: user.id, organizationId: organization.id, agentId: agent.id }) + '\n');
} finally {
  await prisma.$disconnect();
}
