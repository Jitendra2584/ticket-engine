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
  findByEventId(@Query('eventId') eventId: string | undefined) {
    if (eventId === undefined || eventId === null) {
      throw new BadRequestException('eventId query parameter is required');
    }

    const parsed = parseInt(eventId, 10);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('eventId query parameter is required');
    }

    return this.bookingsService.findByEventId(parsed);
  }
}
