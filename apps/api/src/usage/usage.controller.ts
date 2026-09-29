import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsageService } from './usage.service.js';

@ApiTags('Usage')
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Token usage by policy extraction and audit explanation flow' })
  @ApiQuery({ name: 'caseId', required: false })
  summary(@Query('caseId') caseId?: string) { return this.usage.summary(caseId); }
}
