import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { CasesModule } from './cases/cases.module.js';
import { EventsModule } from './events/events.module.js';

@Module({ imports: [PrismaModule, CasesModule, EventsModule] })
export class AppModule {}
