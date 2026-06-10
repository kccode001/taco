/**
 * TACO v2 — shared enums for the invoice pipeline. Kept in one file so the
 * canonical values are imported (never re-declared) by entities, DTOs, the
 * OCR/validation services, and the FE contract.
 */

/**
 * Invoice lifecycle. Flow: validating → ocr_processing → needs_review → done.
 *   - VALIDATING     images uploaded, awaiting / running image validation.
 *   - OCR_PROCESSING all images valid; OCR + classification + SKU mapping running.
 *   - NEEDS_REVIEW   pipeline done but ≥1 line landed in the admin review queue.
 *   - DONE           every line auto-accepted or admin-resolved.
 *   - FAILED         a hard pipeline error (surfaced via error_message).
 */
export enum InvoiceV2Status {
  VALIDATING = 'validating',
  OCR_PROCESSING = 'ocr_processing',
  NEEDS_REVIEW = 'needs_review',
  DONE = 'done',
  FAILED = 'failed',
}

/** Per-image validation outcome. Re-validation only touches `pending` rows. */
export enum InvoiceImageV2ValidationStatus {
  PENDING = 'pending',
  VALID = 'valid',
  INVALID = 'invalid',
}

/**
 * 9-bucket classification taxonomy (LOCKED by KC — do NOT collapse).
 *
 *   TACO:     very-high / high / low-verify / unreadable-guess
 *   NOT TACO: very-high / high / low-verify / unreadable-guess
 *   UNKNOWN:  completely cannot differentiate → needs human check
 *
 * Routing: *_LOW_VERIFY, *_UNREADABLE_GUESS and UNKNOWN_NEEDS_HUMAN go to the
 * admin review queue (needs_review=true). *_VERY_HIGH / *_HIGH auto-accept
 * (needs_review=false) but stay admin-editable.
 */
export enum LineItemV2Classification {
  TACO_VERY_HIGH = 'taco_very_high',
  TACO_HIGH = 'taco_high',
  TACO_LOW_VERIFY = 'taco_low_verify',
  TACO_UNREADABLE_GUESS = 'taco_unreadable_guess',
  NOT_TACO_VERY_HIGH = 'not_taco_very_high',
  NOT_TACO_HIGH = 'not_taco_high',
  NOT_TACO_LOW_VERIFY = 'not_taco_low_verify',
  NOT_TACO_UNREADABLE_GUESS = 'not_taco_unreadable_guess',
  UNKNOWN_NEEDS_HUMAN = 'unknown_needs_human',
}

/** Coarse confidence band derived from the classification — for FE pills/sort. */
export enum LineItemV2ConfidenceBand {
  VERY_HIGH = 'very_high',
  HIGH = 'high',
  LOW_VERIFY = 'low_verify',
  UNREADABLE_GUESS = 'unreadable_guess',
  UNKNOWN = 'unknown',
}

/** Classifications that route a line into the admin review queue. */
export const REVIEW_QUEUE_CLASSIFICATIONS: ReadonlySet<LineItemV2Classification> =
  new Set([
    LineItemV2Classification.TACO_LOW_VERIFY,
    LineItemV2Classification.TACO_UNREADABLE_GUESS,
    LineItemV2Classification.NOT_TACO_LOW_VERIFY,
    LineItemV2Classification.NOT_TACO_UNREADABLE_GUESS,
    LineItemV2Classification.UNKNOWN_NEEDS_HUMAN,
  ]);

/** True when a classification should be flagged needs_review at ingest time. */
export function classificationNeedsReview(c: LineItemV2Classification): boolean {
  return REVIEW_QUEUE_CLASSIFICATIONS.has(c);
}

/** Map a classification bucket to its coarse confidence band. */
export function bandForClassification(
  c: LineItemV2Classification,
): LineItemV2ConfidenceBand {
  switch (c) {
    case LineItemV2Classification.TACO_VERY_HIGH:
    case LineItemV2Classification.NOT_TACO_VERY_HIGH:
      return LineItemV2ConfidenceBand.VERY_HIGH;
    case LineItemV2Classification.TACO_HIGH:
    case LineItemV2Classification.NOT_TACO_HIGH:
      return LineItemV2ConfidenceBand.HIGH;
    case LineItemV2Classification.TACO_LOW_VERIFY:
    case LineItemV2Classification.NOT_TACO_LOW_VERIFY:
      return LineItemV2ConfidenceBand.LOW_VERIFY;
    case LineItemV2Classification.TACO_UNREADABLE_GUESS:
    case LineItemV2Classification.NOT_TACO_UNREADABLE_GUESS:
      return LineItemV2ConfidenceBand.UNREADABLE_GUESS;
    case LineItemV2Classification.UNKNOWN_NEEDS_HUMAN:
    default:
      return LineItemV2ConfidenceBand.UNKNOWN;
  }
}

/** True when a classification asserts the line IS a TACO product. */
export function isTacoClassification(c: LineItemV2Classification): boolean {
  return (
    c === LineItemV2Classification.TACO_VERY_HIGH ||
    c === LineItemV2Classification.TACO_HIGH ||
    c === LineItemV2Classification.TACO_LOW_VERIFY ||
    c === LineItemV2Classification.TACO_UNREADABLE_GUESS
  );
}
