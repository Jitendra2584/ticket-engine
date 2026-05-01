import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.createBooking(dto);
  }

  @Get()
  find(
    @Query('eventId') eventId?: string,
    @Query('email') email?: string,
  ) {
    if (email) {
      return this.bookingsService.findByEmail(email);
    }

    if (!eventId) {
      throw new BadRequestException('eventId or email query parameter is required');
    }

    const parsed = parseInt(eventId, 10);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('eventId must be a valid number');
    }

    return this.bookingsService.findByEventId(parsed);
  }
}
