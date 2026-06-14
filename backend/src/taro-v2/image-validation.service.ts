import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { mediaTypeFor, ImageMediaType } from '../invoices/ocr-utils';

/** Result of validating a single image for the v2 upload flow. */
export interface ImageValidationResult {
  /** Clear enough for downstream OCR? */
  clarity_ok: boolean;
  /** Is it actually an invoice/receipt (handwritten OR digital)? */
  is_invoice: boolean;
  /** Overall pass = clarity_ok AND is_invoice. */
  valid: boolean;
  /** Bahasa-Indonesia reason, present only when !valid. */
  invalid_reason: string | null;
}

/**
 * Validation result + the store name / location read off the invoice in the SAME
 * vision call (photo-first upload). Both raw fields are null when the invoice
 * genuinely doesn't print a store/location — that is NOT an invalidation, it just
 * falls through to manual input downstream.
 */
export interface ImageValidationDetectResult extends ImageValidationResult {
  /** Shop/toko name printed on the invoice, verbatim — null if none is shown. */
  store_name_raw: string | null;
  /** City / location/area printed on the invoice, verbatim — null if none. */
  location_raw: string | null;
}

/** Vision model — KC (2026-06-14): TACO vision/OCR off Opus → Sonnet (cost). Sonnet 4.6 is vision-capable. */
const VALIDATION_MODEL = 'claude-sonnet-4-6';
const VISION_MAX_EDGE_PX = 1600;
const ANTHROPIC_MAX_RETRIES = 3;

/**
 * TACO v2 — image validation. For every uploaded invoice photo, asks Claude
 * vision two things before any OCR spend:
 *   1. Is the image clear/legible enough to OCR later?
 *   2. Is it actually an invoice/receipt — handwritten OR digital (not a
 *      selfie, storefront, random object, blank page, etc.)?
 *
 * On failure it returns a short Bahasa-Indonesia reason the PWA shows the rep
 * so they can retake/delete. Pure read — persistence is the caller's job.
 */
@Injectable()
export class ImageValidationService {
  private readonly logger = new Logger(ImageValidationService.name);
  private readonly anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    });
  }

  async validate(imagePath: string): Promise<ImageValidationResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const { base64, mediaType } = await this.prepareImage(imagePath);

    const system = [
      'You are an image gatekeeper for TACO, an Indonesian building-materials brand.',
      'Sales reps photograph supplier invoices/receipts (nota/faktur/kwitansi) to upload.',
      'Invoices may be HANDWRITTEN or printed/digital. Both are valid.',
      'For the given image, judge TWO things:',
      '  1. clarity_ok — is it sharp/legible enough that text could be OCR-read later? Reject only when genuinely unusable: heavy blur, too dark/bright, extreme glare, cropped so most text is cut off, or far too low-resolution.',
      '  2. is_invoice — is it actually an invoice/receipt/nota/faktur/kwitansi (a list of items/quantities/prices)? Reject selfies, people, storefronts, random objects, blank paper, screenshots of unrelated apps, etc.',
      'Be lenient on clarity for handwriting that a human could still read; be strict on is_invoice.',
      'When NOT valid, write `invalid_reason` as ONE short sentence in BAHASA INDONESIA, friendly and actionable (tell the rep what to do).',
      '  Examples: "Foto terlalu buram, mohon foto ulang dengan lebih fokus." / "Ini bukan foto nota/faktur. Mohon unggah foto nota pembelian." / "Foto terlalu gelap, mohon ambil di tempat yang lebih terang."',
      'When valid, set invalid_reason to null.',
      'Return STRICT JSON only, no prose, no markdown fences:',
      '{ "clarity_ok": boolean, "is_invoice": boolean, "invalid_reason": string|null }',
    ].join('\n');

    const response = await this.anthropic.messages.create({
      model: VALIDATION_MODEL,
      max_tokens: 512,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Validate this image.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block && block.type === 'text' ? block.text : '{}';
    const parsed = this.parseJson(raw);

    const clarity_ok = parsed.clarity_ok === true;
    const is_invoice = parsed.is_invoice === true;
    const valid = clarity_ok && is_invoice;
    let invalid_reason: string | null = null;
    if (!valid) {
      invalid_reason =
        typeof parsed.invalid_reason === 'string' && parsed.invalid_reason.trim()
          ? parsed.invalid_reason.trim()
          : this.fallbackReason(clarity_ok, is_invoice);
    }
    return { clarity_ok, is_invoice, valid, invalid_reason };
  }

  /**
   * Photo-first upload gate: validate the image AND, in the SAME vision call,
   * read the store/toko name + location/city printed on the invoice. One call —
   * no extra spend over plain `validate()`. The invalidate decision still rests
   * purely on clarity_ok / is_invoice / invalid_reason (reused). store_name_raw /
   * location_raw are returned for the caller to match against master data; both
   * are null when the invoice simply doesn't print them (→ manual, not invalid).
   */
  async validateAndDetect(
    imagePath: string,
  ): Promise<ImageValidationDetectResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const { base64, mediaType } = await this.prepareImage(imagePath);

    const system = [
      'You are an image gatekeeper for TACO, an Indonesian building-materials brand.',
      'Sales reps photograph supplier invoices/receipts (nota/faktur/kwitansi) of the building-materials SHOP (toko) they are visiting.',
      'Invoices may be HANDWRITTEN or printed/digital. Both are valid.',
      'Do THREE things for the given image:',
      '  1. clarity_ok — is it sharp/legible enough that text could be OCR-read later? Reject only when genuinely unusable: heavy blur, too dark/bright, extreme glare, cropped so most text is cut off, or far too low-resolution.',
      '  2. is_invoice — is it actually an invoice/receipt/nota/faktur/kwitansi (a list of items/quantities/prices)? Reject selfies, people, storefronts, random objects, blank paper, screenshots of unrelated apps, etc.',
      '  3. Read the SHOP/TOKO identity printed on the nota: `store_name` = the building-materials shop/toko name (usually the letterhead/header of the nota, e.g. "Toko Sinar Jaya", "TB Maju Bersama", "UD Berkah"); `location` = the shop\'s city / area / kota printed near it (e.g. "Cirebon", "Jakarta", "Bandung").',
      'Be lenient on clarity for handwriting that a human could still read; be strict on is_invoice.',
      'CRITICAL: if the invoice is otherwise fine but simply does NOT print a shop name and/or location, that is STILL a valid invoice — set the missing field(s) to null. Do NOT mark it invalid for a missing store/location.',
      'For store_name / location: transcribe EXACTLY what is printed (verbatim, original spelling). Use null when that field is genuinely not shown. Never guess or invent.',
      'When NOT valid (bad clarity or not-an-invoice), write `invalid_reason` as ONE short sentence in BAHASA INDONESIA, friendly and actionable (tell the rep what to do). When valid, set invalid_reason to null.',
      '  Examples: "Foto terlalu buram, mohon foto ulang dengan lebih fokus." / "Ini bukan foto nota/faktur. Mohon unggah foto nota pembelian." / "Bagian nota terpotong, mohon foto ulang seluruh nota."',
      'Return STRICT JSON only, no prose, no markdown fences:',
      '{ "clarity_ok": boolean, "is_invoice": boolean, "invalid_reason": string|null, "store_name": string|null, "location": string|null }',
    ].join('\n');

    const response = await this.anthropic.messages.create({
      model: VALIDATION_MODEL,
      max_tokens: 512,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Validate this image and read the shop name + location.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block && block.type === 'text' ? block.text : '{}';
    const parsed = this.parseJson(raw);

    const clarity_ok = parsed.clarity_ok === true;
    const is_invoice = parsed.is_invoice === true;
    const valid = clarity_ok && is_invoice;
    let invalid_reason: string | null = null;
    if (!valid) {
      invalid_reason =
        typeof parsed.invalid_reason === 'string' && parsed.invalid_reason.trim()
          ? parsed.invalid_reason.trim()
          : this.fallbackReason(clarity_ok, is_invoice);
    }

    const store_name_raw =
      typeof parsed.store_name === 'string' && parsed.store_name.trim()
        ? parsed.store_name.trim()
        : null;
    const location_raw =
      typeof parsed.location === 'string' && parsed.location.trim()
        ? parsed.location.trim()
        : null;

    return {
      clarity_ok,
      is_invoice,
      valid,
      invalid_reason,
      store_name_raw,
      location_raw,
    };
  }

  /** Deterministic Indonesian fallback if Claude omits a reason on a fail. */
  private fallbackReason(clarityOk: boolean, isInvoice: boolean): string {
    if (!isInvoice) {
      return 'Ini sepertinya bukan foto nota/faktur. Mohon unggah foto nota pembelian.';
    }
    if (!clarityOk) {
      return 'Foto kurang jelas untuk dibaca. Mohon foto ulang dengan lebih fokus dan terang.';
    }
    return 'Gambar tidak valid. Mohon unggah foto nota yang jelas.';
  }

  private parseJson(raw: string): {
    clarity_ok?: unknown;
    is_invoice?: unknown;
    invalid_reason?: unknown;
    store_name?: unknown;
    location?: unknown;
  } {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = objMatch ? objMatch[0] : cleaned;
    try {
      return JSON.parse(jsonStr) as {
        clarity_ok?: unknown;
        is_invoice?: unknown;
        invalid_reason?: unknown;
        store_name?: unknown;
        location?: unknown;
      };
    } catch {
      this.logger.warn(`Validation parse failed: ${jsonStr.slice(0, 160)}`);
      // Fail-closed: treat unparseable as invalid so a bad image can't sneak through.
      return { clarity_ok: false, is_invoice: false, invalid_reason: null };
    }
  }

  /** Downscale large uploads before sending to Claude vision. */
  private async prepareImage(
    imagePath: string,
  ): Promise<{ base64: string; mediaType: ImageMediaType }> {
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    if (buf.byteLength < 256 * 1024) {
      return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
    }
    try {
      const img = sharp(buf, { failOn: 'none' }).rotate();
      const meta = await img.metadata();
      const longerEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longerEdge <= VISION_MAX_EDGE_PX) {
        return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
      }
      const resized = await img
        .resize({
          width: meta.width && meta.width >= (meta.height ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          height: meta.height && meta.height > (meta.width ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      const mediaType: ImageMediaType = ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return { base64: resized.toString('base64'), mediaType };
    } catch (e) {
      this.logger.warn(`Resize failed for ${imagePath} (${(e as Error).message}) — sending original.`);
      return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
    }
  }
}
