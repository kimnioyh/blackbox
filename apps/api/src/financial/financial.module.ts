import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { FinancialController } from './financial.controller.js';
import { FinancialService } from './financial.service.js';

@Module({ imports: [EventsModule], controllers: [FinancialController], providers: [FinancialService] })
export class FinancialModule {}
