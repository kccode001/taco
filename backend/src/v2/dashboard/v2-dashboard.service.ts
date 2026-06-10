import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  AiInsightQueryDto,
  RecapQueryDto,
  TrendingQueryDto,
} from '../dto/period.dto';

/**
 * v2 MANAGEMENT — Dashboard aggregation + AI insight.
 *
 * SCAFFOLD ONLY — throws 501 until Grout's InvoiceV2 / InvoiceLineItemV2 +
 * Area schema lands. Aggregations read those tables (qty + classification +
 * area joins); the AI-insight endpoint runs Claude (claude-opus-4-8) over the
 * PRE-AGGREGATED rollups for the selected period — never over raw rows.
 *
 * Anthropic client wiring (when implemented):
 *   new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })  // key is set in .env
 */
@Injectable()
export class V2DashboardService {
  private notWired(): never {
    throw new NotImplementedException(
      'TACO v2 Dashboard: endpoint scaffolded, awaiting Grout canonical invoice/area schema.',
    );
  }

  /** Items logged split by area + quantity sold over the period. */
  recap(query: RecapQueryDto) {
    void query;
    this.notWired();
  }

  /** Top trending items per area for the window. */
  trending(query: TrendingQueryDto) {
    void query;
    this.notWired();
  }

  /** LLM over pre-aggregated period rollups → market-demand insight. */
  aiInsight(query: AiInsightQueryDto) {
    void query;
    this.notWired();
  }
}
