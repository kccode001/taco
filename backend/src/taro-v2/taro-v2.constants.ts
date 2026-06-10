/**
 * TACO v2 — shared constants for the invoice spine. Separate Redis queue from
 * v1 `taro-invoice.ocr` so the two pipelines never share jobs.
 */
export const QUEUE_TARO_V2_OCR = 'taro-v2-invoice.ocr';
export const JOB_PROCESS_TARO_V2 = 'process-taro-v2-invoice';

/** Sub-directory under UPLOAD_DIR where v2 invoice images are stored. */
export const TARO_V2_UPLOAD_SUBDIR = 'taro-v2';

/** JWT scope embedded in signed v2 image URLs. */
export const TARO_V2_IMAGE_SCOPE = 'taro_v2_invoice_image';
