import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateApprovalSchema, CreateDisputeSchema, CreatePaymentSchema } from '@blackbox/shared';
import { parseBody } from '../common/parse.js';
import { requestKey } from '../common/request-key.js';
import { FinancialService } from './financial.service.js';

@ApiTags('Financial')
@Controller('cases/:caseId')
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  @Post('approvals')
  @ApiOperation({ summary: 'Record an explicit human approval or rejection' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ schema: { type: 'object', required: ['decision'], properties: {
    decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, approvedAmount: { type: 'string' },
    currency: { type: 'string' }, actorUserId: { type: 'string' }, externalActorId: { type: 'string' },
  } } })
  approve(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined, @Body() body: unknown) {
    return this.financial.approve(caseId, requestKey(header), parseBody(CreateApprovalSchema, body));
  }

  @Post('payments')
  @ApiOperation({ summary: 'Record an externally executed payment result; this endpoint does not execute a payment' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ schema: { type: 'object', required: ['merchant', 'subtotal', 'fee', 'totalAmount', 'currency', 'status'], properties: {
    externalPaymentId: { type: 'string' }, merchant: { type: 'string' }, subtotal: { type: 'string' },
    fee: { type: 'string' }, totalAmount: { type: 'string' }, currency: { type: 'string' },
    status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED', 'BLOCKED'] },
    executedAt: { type: 'string', format: 'date-time' },
  } } })
  pay(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined, @Body() body: unknown) {
    return this.financial.pay(caseId, requestKey(header), parseBody(CreatePaymentSchema, body));
  }

  @Post('disputes')
  @ApiOperation({ summary: 'Raise a dispute and record it on the Case timeline' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: {
    reason: { type: 'string' }, disputedPaymentId: { type: 'string' },
  } } })
  dispute(@Param('caseId') caseId: string, @Headers('idempotency-key') header: string | undefined, @Body() body: unknown) {
    return this.financial.dispute(caseId, requestKey(header), parseBody(CreateDisputeSchema, body));
  }
}
