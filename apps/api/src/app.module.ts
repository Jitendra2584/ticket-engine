import { Module } from '@nestjs/common';
import { PricingModule } from './pricing/pricing.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { EventsModule } from './events/events.module';
import { BookingsModule } from './bookings/bookings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    PricingModule,
    EventsModule,
    BookingsModule,
    AnalyticsModule,
    SeedModule,
  ],
})
export class AppModule {}
