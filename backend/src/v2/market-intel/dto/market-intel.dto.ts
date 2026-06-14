import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { V2_PERIODS } from '../../dto/period.dto';
import type { V2Period } from '../../dto/period.dto';

/**
 * Shared query for the market-intel endpoints: a period window + optional
 * single-area filter. The window is applied over the invoice transaction date
 * (`invoice_date`, falling back to `created_at` when an invoice has no parsed
 * date) per PRD §8 — these are market signals tied to when a deal happened,
 * not when the photo was uploaded.
 */
export class MarketIntelQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area?: string;
}

/** Price-bands — same scope + an optional top-N SKU cap (default 10). */
export class PriceBandsQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Per-SKU evidence drawer — requires the SKU id whose band was clicked. */
export class SkuEvidenceQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsUUID()
  sku_id?: string;
}

/** Demand-mix — same scope + an optional top-N SKUs-per-area cap (default 5). */
export class DemandMixQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  top_n?: string;
}
