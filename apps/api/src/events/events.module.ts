import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({ imports: [CasesModule], controllers: [EventsController], providers: [EventsService] })
export class EventsModule {}
