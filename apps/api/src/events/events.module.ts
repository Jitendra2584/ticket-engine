import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [PricingModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
