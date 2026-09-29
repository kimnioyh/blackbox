import { Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requestKey } from '../common/request-key.js';
import { ProofsService } from './proofs.service.js';

@ApiTags('Blockchain proof')
@Controller('cases/:caseId/proofs')
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  @Post()
  @ApiOperation({ summary: 'Commit the pre-proof Case evidence hash to Sepolia' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined) {
    return this.proofs.create(caseId, requestKey(header));
  }

  @Get('verify')
  @ApiOperation({ summary: 'Reconstruct evidence and compare its hash with the stored and on-chain proof' })
  verify(@Param('caseId') caseId: string) { return this.proofs.verify(caseId); }
}
