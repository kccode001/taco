import { Injectable, NotImplementedException } from '@nestjs/common';
import { ListRecommendationsDto } from './dto/list-recommendations.dto';

/**
 * v2 MANAGEMENT — Recommendation engine.
 *
 * Derives recommendations from the mismatch reasons captured on the admin
 * resolve flow (Grout's PATCH line-items writes `mismatch_reason`). Each
 * recommendation is tagged `auto_actionable`:
 *   true  → system can act (add synonym / create SKU / brand alias) → "Terapkan"
 *   false → acknowledge-only ("Akui")
 *
 * SCAFFOLD ONLY — throws 501 until the reason-capture column + classification
 * pipeline land from Grout. `apply` is the guarded auto-action path (must be
 * reversible / modal-confirmed per concept brief); `acknowledge` just records.
 */
@Injectable()
export class RecommendationsService {
  private notWired(): never {
    throw new NotImplementedException(
      'TACO v2 Recommendations: endpoint scaffolded, awaiting Grout reason-capture + classification schema.',
    );
  }

  list(_query: ListRecommendationsDto) {
    this.notWired();
  }

  /** Auto-action a recommendation (only valid when auto_actionable=true). */
  apply(_id: string) {
    this.notWired();
  }

  /** Acknowledge-only (for non-auto-actionable recommendations). */
  acknowledge(_id: string) {
    this.notWired();
  }
}
