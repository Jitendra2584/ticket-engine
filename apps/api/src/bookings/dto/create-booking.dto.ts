import { IsEmail, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for creating a new booking.
 * Uses class-validator decorators for runtime validation via NestJS ValidationPipe.
 * Properties use definite assignment assertions (!) since they are populated by class-transformer.
 */
export class CreateBookingDto {
  @IsInt()
  @Min(1)
  eventId!: number;

  @IsEmail()
  userEmail!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Price the user saw on the frontend. If it differs from the
   *  server-calculated price, the booking is rejected with PRICE_CHANGED. */
  @IsNumber()
  expectedPrice!: number;
}

/**
 * Type-only alias for frontend consumption.
 * Frontend imports this with `import type` so there is no runtime dependency on class-validator.
 */
export type CreateBookingInput = Pick<
  CreateBookingDto,
  'eventId' | 'userEmail' | 'quantity' | 'expectedPrice'
>;
