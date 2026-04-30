import { Transform, Type } from "class-transformer";
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsInt,
  Min,
  IsNumber,
  IsOptional,
  IsObject,
  IsBoolean,
  ValidateNested,
} from "class-validator";

/**
 * Configuration for which pricing rules are enabled and their weights.
 * Stored in the event's pricing_rules JSON column.
 */
export class PricingConfig {
  @IsBoolean()
  enabled!: boolean;

  @IsNumber()
  @Min(0)
  weight!: number;
}

export class PricingRulesConfigDto {
  @Type(() => PricingConfig)
  @ValidateNested({ each: true })
  timeRule!: PricingConfig;

  @Type(() => PricingConfig)
  @ValidateNested({ each: true })
  demandRule!: PricingConfig;

  @Type(() => PricingConfig)
  @ValidateNested({ each: true })
  inventoryRule!: PricingConfig;
}

/**
 * DTO for creating a new event.
 * Uses class-validator decorators for runtime validation via NestJS ValidationPipe.
 * Properties use definite assignment assertions (!) since they are populated by class-transformer.
 */
export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  venue!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  totalTickets!: number;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsNumber()
  @Min(0)
  floorPrice!: number;

  @IsNumber()
  @Min(0)
  ceilingPrice!: number;

  @Type(() => PricingRulesConfigDto)
  @ValidateNested({ each: true })
  @IsOptional()
  pricingRules?: PricingRulesConfigDto;
}

/**
 * Type-only alias for frontend consumption.
 * Frontend imports this with `import type` so there is no runtime dependency on class-validator.
 */
export type CreateEventInput = Pick<
  CreateEventDto,
  | "name"
  | "date"
  | "venue"
  | "description"
  | "totalTickets"
  | "basePrice"
  | "floorPrice"
  | "ceilingPrice"
  | "pricingRules"
>;
