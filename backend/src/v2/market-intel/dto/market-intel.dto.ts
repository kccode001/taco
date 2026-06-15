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

/** Price-bands (Section 3 Laporan SKU) — paginated + searchable by SKU name. */
export class PriceBandsQueryDto extends PaginatedMarketIntelQueryDto {}

/**
 * Per-SKU price history (Section 3 detail modal). `sku_id` is the clicked row;
 * `area` + `store_id` are in-modal filters (AC-25/AC-27) — they default to
 * "Semua" (omitted) on the FE and re-fire this endpoint on change. The modal is
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

/** Top-SKUs-per-area (Section 1 Top-10 TACO) — scope + optional top-N (def 5). */
export class TopSkusPerAreaQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  top_n?: string;
}

/**
 * Top non-TACO invoices card (Section 1, AC-31 — REVISED 2026-06-15 by KC). The
 * card pivoted from "most-frequent non-TACO SKUs" to "invoices most dominated by
 * non-TACO, by value": uploaded invoices ranked by non-TACO value share desc.
 * `top_n` defaults to 10.
 */
export class TopNonTacoInvoicesQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsString()
  top_n?: string;
}

/** Category distribution + monthly trend (Section 2, AC-32/AC-33). */
export class CategoryQueryDto extends MarketIntelQueryDto {
  /** Only `month` is supported today; reserved for finer buckets later. */
  @IsOptional()
  @IsIn(['month'])
  granularity?: 'month';
}

/** Category → SKU drill (Section 2 modal, AC-34). `category` is the pie slice. */
export class CategorySkusQueryDto extends MarketIntelQueryDto {
  /** A `catalog_category` value, or `Tidak terkategori` for the NULL bucket. */
  @IsOptional()
  @IsString()
  category?: string;
}

/** Brand-bucket distribution pie (Section 4, AC-38/AC-41). */
export class BrandBucketDistributionQueryDto extends MarketIntelQueryDto {}

/**
 * Brand-bucket drill modal (Section 4, AC-39/AC-40). One endpoint, three levels
 * driven by the params present:
 *   - bucket only            → `level=brands` (paginated brand list)
 *   - bucket + brand_id      → `level=skus`   (per-brand SKU list + price stats)
 *   - bucket + brand_id + sku→ `level=invoices` (invoice list for that SKU)
 *
 * `bucket` ∈ {taco, kompetitor, lain_lain}. `brand_id` is a competitor brand
 * UUID for the Kompetitor bucket, or the sentinel `__taco__` / `__lain_lain__`
 * returned by the brands level for the single-brand buckets — so it is a plain
 * string, not a UUID. `sku` is a TACO sku_id (taco) or the raw competitor SKU
 * label text (kompetitor / lain_lain) — the `key` the SKU level handed back.
 */
export class BrandBucketDetailQueryDto extends PaginatedMarketIntelQueryDto {
  @IsIn(['taco', 'kompetitor', 'lain_lain'])
  bucket: 'taco' | 'kompetitor' | 'lain_lain';

  @IsOptional()
  @IsString()
  brand_id?: string;

  @IsOptional()
  @IsString()
  sku?: string;
}

/** Per-store pricing sub-section + store pricing history (Section 3, AC-37). */
export class SkuStorePricingQueryDto extends MarketIntelQueryDto {
  @IsOptional()
  @IsUUID()
  sku_id?: string;
}
