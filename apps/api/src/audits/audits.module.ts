import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { KilnModule } from '../kiln/kiln.module.js';
import { ProofsModule } from '../blockchain/proofs.module.js';
import { AuditsController } from './audits.controller.js';
import { AuditsService } from './audits.service.js';

@Module({ imports: [EventsModule, KilnModule, ProofsModule], controllers: [AuditsController], providers: [AuditsService] })
export class AuditsModule {}
