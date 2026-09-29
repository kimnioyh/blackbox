import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { KilnModule } from '../kiln/kiln.module.js';
import { PoliciesController } from './policies.controller.js';
import { PoliciesService } from './policies.service.js';

@Module({ imports: [EventsModule, KilnModule], controllers: [PoliciesController], providers: [PoliciesService] })
export class PoliciesModule {}
