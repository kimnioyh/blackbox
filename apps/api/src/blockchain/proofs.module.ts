import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { ProofsController } from './proofs.controller.js';
import { ProofsService } from './proofs.service.js';

@Module({ imports: [EventsModule], controllers: [ProofsController], providers: [ProofsService], exports: [ProofsService] })
export class ProofsModule {}
