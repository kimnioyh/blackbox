import { Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requestKey } from '../common/request-key.js';
import { AuditsService } from './audits.service.js';

@ApiTags('Audit')
@Controller('cases/:caseId/audits')
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Post()
  @ApiOperation({ summary: 'Audit Case evidence with deterministic checks and a Qwen3-32B explanation' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined) {
    return this.audits.create(caseId, requestKey(header));
  }
}
