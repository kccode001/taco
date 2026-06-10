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

/** Latest Claude model — KC: "use latest Claude model for OCR/classification". */
const VALIDATION_MODEL = 'claude-opus-4-8';
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
