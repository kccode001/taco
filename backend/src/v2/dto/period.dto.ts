import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Shared period vocabulary for the v2 dashboard + AI-insight endpoints.
 * `period` selects a rolling/calendar window the aggregation runs over.
 * Final supported set may grow once Grout's invoice timestamps are confirmed.
 */
export const V2_PERIODS = [
  '7d',
  '30d',
  '90d',
  'this_month',
  'last_month',
  'this_quarter',
  'ytd',
  'all',
] as const;

export type V2Period = (typeof V2_PERIODS)[number];

/** Recap = items logged split by area + qty sold over the period. */
export class RecapQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  /** Optional area filter (canonical Area id — shape TBD by Grout). */
  @IsOptional()
  @IsUUID()
  area?: string;
}

/** Trending = top items per area for the window. */
export class TrendingQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area?: string;

  /** Optional cap on items returned per area (string from querystring). */
  @IsOptional()
  @IsString()
  limit?: string;
}

/** AI-insight runs an LLM over the pre-aggregated rollups for the period. */
export class AiInsightQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area?: string;
}

/** latest-insight reads the most recent SAVED insight row without recomputing. */
export class LatestInsightQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area?: string;
}

/** Analytics endpoints — period + optional single area filter + limit. */
export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area?: string;

  /** Optional item limit (top-skus endpoint). */
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Area drill-down query — requires a single area UUID. */
export class AnalyticsDrillQueryDto {
  @IsOptional()
  @IsIn(V2_PERIODS)
  period?: V2Period;

  @IsOptional()
  @IsUUID()
  area_id?: string;
}
