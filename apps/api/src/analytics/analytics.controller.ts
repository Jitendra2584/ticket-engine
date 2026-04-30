import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('events/:id')
  getEventAnalytics(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.getEventAnalytics(id);
  }

  @Get('summary')
  getSystemSummary() {
    return this.analyticsService.getSystemSummary();
  }
}
