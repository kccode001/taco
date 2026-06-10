import { IsBooleanString, IsIn, IsOptional, IsUUID } from 'class-validator';

export const RECOMMENDATION_STATUSES = [
  'pending',
  'applied',
  'acknowledged',
  'dismissed',
] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * List recommendations derived from captured mismatch reasons.
 * Each recommendation carries `auto_actionable: true|false` →
 * FE shows "Terapkan" (apply) only when true, else acknowledge-only.
 */
export class ListRecommendationsDto {
  @IsOptional()
  @IsIn(RECOMMENDATION_STATUSES)
  status?: RecommendationStatus;

  /** "true"/"false" from querystring — filter by actionability. */
  @IsOptional()
  @IsBooleanString()
  auto_actionable?: string;

  @IsOptional()
  @IsUUID()
  area?: string;
}
