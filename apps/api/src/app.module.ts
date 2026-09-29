import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { CasesModule } from './cases/cases.module.js';
import { EventsModule } from './events/events.module.js';
import { KilnModule } from './kiln/kiln.module.js';
import { PoliciesModule } from './policies/policies.module.js';
import { FinancialModule } from './financial/financial.module.js';
import { ProofsModule } from './blockchain/proofs.module.js';

@Module({ imports: [PrismaModule, CasesModule, EventsModule, KilnModule, PoliciesModule, FinancialModule, ProofsModule] })
export class AppModule {}
