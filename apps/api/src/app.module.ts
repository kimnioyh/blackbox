import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { CasesModule } from './cases/cases.module.js';
import { EventsModule } from './events/events.module.js';
import { KilnModule } from './kiln/kiln.module.js';
import { PoliciesModule } from './policies/policies.module.js';

@Module({ imports: [PrismaModule, CasesModule, EventsModule, KilnModule, PoliciesModule] })
export class AppModule {}
