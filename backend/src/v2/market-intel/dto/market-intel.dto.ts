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

/**
 * Server-side search + pagination (PRD §8): `q` is a case-insensitive substring
 * filter (per-endpoint columns); `page` is 1-based; `page_size` defaults to 10.
 * Both numeric params arrive as query strings and are clamped in the service.
 */
export class PaginatedMarketIntelQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  page_size?: string;
}

/** Price-bands (R2 hero) — paginated + searchable by SKU name. */
export class PriceBandsQueryDto extends PaginatedMarketIntelQueryDto {}

/**
 * Per-SKU price history (R5 modal). `sku_id` is the clicked band; `area` +
 * `store_id` are the IN-MODAL filters (AC-25/AC-27) — they default to "Semua"
 * (omitted) on the FE and re-fire this endpoint on change. The modal is
 * self-contained: it does NOT inherit the page-level area filter.
 */
export class SkuPriceHistoryQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsUUID()
  sku_id?: string;

  @IsOptional()
  @IsUUID()
  store_id?: string;
}

/** Top-SKUs-per-area (R1) — same scope + an optional top-N per area (default 5). */
export class TopSkusPerAreaQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  top_n?: string;
}

/** Adu Harga (R3) — paginated + searchable same-receipt price-gap pairs. */
export class PriceGapPairsQueryDto extends PaginatedMarketIntelQueryDto {}

/** White-Space (R4) — paginated + searchable (taco_sku × region) anti-join. */
export class SkuWhitespaceQueryDto extends PaginatedMarketIntelQueryDto {}
