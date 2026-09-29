import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppendEventRequestSchema } from '@blackbox/shared';
import { parseBody } from '../common/parse.js';
import { EventsService } from './events.service.js';

@ApiTags('Events')
@Controller('cases/:caseId/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Append a typed event to a Case' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ schema: { type: 'object', required: ['eventType', 'actorType', 'source', 'verificationLevel', 'occurredAt', 'payload'], properties: {
    idempotencyKey: { type: 'string' }, eventType: { type: 'string' }, actorType: { type: 'string' },
    actorId: { type: 'string', nullable: true }, source: { type: 'string' },
    verificationLevel: { type: 'string' }, occurredAt: { type: 'string', format: 'date-time' },
    payload: { type: 'object' },
  } } })
  append(@Param('caseId') caseId: string, @Headers('idempotency-key') headerKey: string | undefined, @Body() body: unknown) {
    const input = parseBody(AppendEventRequestSchema, body);
    if (headerKey && input.idempotencyKey && headerKey !== input.idempotencyKey) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_MISMATCH', message: 'Header and body idempotency keys differ' });
    }
    const idempotencyKey = headerKey ?? input.idempotencyKey;
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Provide Idempotency-Key header or idempotencyKey body field' });
    }
    return this.events.append(caseId, idempotencyKey, input);
  }

  @Get()
  @ApiOperation({ summary: 'List all Case events in sequence order' })
  list(@Param('caseId') caseId: string) { return this.events.list(caseId); }
}
