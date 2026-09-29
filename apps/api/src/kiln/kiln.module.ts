import { Module } from '@nestjs/common';
import { KilnService } from './kiln.service.js';

@Module({ providers: [KilnService], exports: [KilnService] })
export class KilnModule {}
