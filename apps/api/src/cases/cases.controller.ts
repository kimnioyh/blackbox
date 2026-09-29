import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateCaseSchema } from '@blackbox/shared';
import { parseBody } from '../common/parse.js';
import { CasesService } from './cases.service.js';

@ApiTags('Cases')
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a financial Case' })
  @ApiBody({ schema: { type: 'object', required: ['title'], properties: {
    title: { type: 'string' }, organizationId: { type: 'string', nullable: true },
    ownerUserId: { type: 'string', nullable: true }, agentId: { type: 'string', nullable: true },
    externalUserId: { type: 'string', nullable: true }, externalCaseId: { type: 'string', nullable: true },
  } } })
  create(@Body() body: unknown) { return this.cases.create(parseBody(CreateCaseSchema, body)); }

  @Get()
  @ApiOperation({ summary: 'List recent Cases' })
  list() { return this.cases.list(); }

  @Get(':caseId')
  @ApiOperation({ summary: 'Get a Case' })
  get(@Param('caseId') id: string) { return this.cases.get(id); }
}
