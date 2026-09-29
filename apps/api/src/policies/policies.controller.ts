import { BadRequestException, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { PoliciesService } from './policies.service.js';

function requestKey(header: string | undefined): string {
  if (header === undefined) return randomUUID();
  const key = header.trim();
  if (!key || key.length > 200) throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 1–200 characters' });
  return key;
}

@ApiTags('Policy')
@Controller('cases/:caseId/policy')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Post('parse')
  @ApiOperation({ summary: 'Parse latest user instruction with Kiln Qwen3-32B, persist a new policy version' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  parse(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined) {
    return this.policies.parse(caseId, requestKey(header));
  }

  @Post('check')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evaluate the current policy against the latest agent decision using deterministic code' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiResponse({ status: 200, description: 'ALLOW or BLOCK, individual checks, and reason codes. BLOCK is a normal result.' })
  check(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined) {
    return this.policies.check(caseId, requestKey(header));
  }
}
