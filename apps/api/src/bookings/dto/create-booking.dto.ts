import { IsEmail, IsInt, Min } from 'class-validator';

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
}

/**
 * Type-only alias for frontend consumption.
 * Frontend imports this with `import type` so there is no runtime dependency on class-validator.
 */
export type CreateBookingInput = Pick<
  CreateBookingDto,
  'eventId' | 'userEmail' | 'quantity'
>;
