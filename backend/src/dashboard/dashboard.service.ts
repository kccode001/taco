import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { Store } from '../database/entities/store.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { MarketDigest } from '../database/entities/market-digest.entity';
import { CompetitorHubQueryDto } from './dto/competitor-hub-query.dto';
import { PriceMovementQueryDto } from './dto/price-movement-query.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepo: Repository<InvoiceLineItem>,
    @InjectRepository(MarketDigest)
    private readonly digestRepo: Repository<MarketDigest>,
  ) {}

  async getKpis(): Promise<{
    visits_today: number;
    coverage_percent: number;
    active_reps: number;
    stores_visited_today: number;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const [visitsToday, storesVisitedToday, totalActiveStores, activeReps] = await Promise.all([
      this.visitRepo.count({
        where: { visit_date: today, status: VisitStatus.SUBMITTED },
      }),
      this.visitRepo
        .createQueryBuilder('v')
        .select('COUNT(DISTINCT v.store_id)', 'count')
        .where('v.visit_date = :today', { today })
        .andWhere('v.status = :status', { status: VisitStatus.SUBMITTED })
        .getRawOne()
        .then((r) => parseInt(r?.count ?? '0', 10)),
      this.storeRepo.count({ where: { is_active: true } }),
      this.visitRepo
        .createQueryBuilder('v')
        .select('COUNT(DISTINCT v.user_id)', 'count')
        .where('v.visit_date = :today', { today })
        .andWhere('v.status = :status', { status: VisitStatus.SUBMITTED })
        .getRawOne()
        .then((r) => parseInt(r?.count ?? '0', 10)),
    ]);

    const coverage_percent =
      totalActiveStores > 0
        ? Math.round((storesVisitedToday / totalActiveStores) * 100 * 100) / 100
        : 0;

    return {
      visits_today: visitsToday,
      coverage_percent,
      active_reps: activeReps,
      stores_visited_today: storesVisitedToday,
    };
  }

  async getLiveFeed(limit: number = 50): Promise<Visit[]> {
    return this.visitRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.store', 'store')
      .leftJoinAndSelect('v.user', 'user')
      .leftJoinAndSelect('v.sections', 'sections')
      .where('v.status = :status', { status: VisitStatus.SUBMITTED })
      .orderBy('v.submitted_at', 'DESC')
      .take(limit)
      .getMany();
  }

  async getCompetitorHub(query: CompetitorHubQueryDto): Promise<any[]> {
    const qb = this.lineItemRepo
      .createQueryBuilder('li')
      .leftJoinAndSelect('li.competitor_sku', 'sku')
      .leftJoinAndSelect('sku.brand', 'brand')
      .leftJoinAndSelect('li.invoice', 'invoice')
      .leftJoinAndSelect('invoice.visit', 'visit')
      .leftJoinAndSelect('invoice.store', 'store')
      .leftJoinAndSelect('store.territory', 'territory')
      .where('li.competitor_sku_id IS NOT NULL');

    if (query.brand_id) {
      qb.andWhere('sku.brand_id = :brand_id', { brand_id: query.brand_id });
    }

    if (query.territory_id) {
      qb.andWhere('store.territory_id = :territory_id', {
        territory_id: query.territory_id,
      });
    }

    if (query.date_from) {
      qb.andWhere('visit.visit_date >= :date_from', { date_from: query.date_from });
    }

    if (query.date_to) {
      qb.andWhere('visit.visit_date <= :date_to', { date_to: query.date_to });
    }

    const items = await qb.orderBy('li.created_at', 'DESC').getMany();

    // Group by competitor SKU
    const grouped = items.reduce<Record<string, any>>((acc, li) => {
      const skuId = li.competitor_sku_id;
      if (!acc[skuId]) {
        acc[skuId] = {
          competitor_sku: li.competitor_sku,
          brand: li.competitor_sku?.brand ?? null,
          occurrences: 0,
          total_qty: 0,
          avg_unit_price: 0,
          prices: [] as number[],
          line_items: [],
        };
      }
      acc[skuId].occurrences += 1;
      acc[skuId].total_qty += li.qty ?? 0;
      if (li.unit_price != null) acc[skuId].prices.push(li.unit_price);
      acc[skuId].line_items.push(li);
      return acc;
    }, {});

    return Object.values(grouped).map((g: any) => ({
      ...g,
      avg_unit_price:
        g.prices.length > 0
          ? Math.round((g.prices.reduce((a: number, b: number) => a + b, 0) / g.prices.length) * 100) / 100
          : null,
      line_items: undefined, // exclude raw items from response
    }));
  }

  async getPriceMovement(query: PriceMovementQueryDto): Promise<any[]> {
    const days = query.days ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const qb = this.lineItemRepo
      .createQueryBuilder('li')
      .leftJoinAndSelect('li.competitor_sku', 'sku')
      .leftJoinAndSelect('li.invoice', 'invoice')
      .leftJoinAndSelect('invoice.visit', 'visit')
      .where('li.competitor_sku_id IS NOT NULL')
      .andWhere('li.unit_price IS NOT NULL')
      .andWhere('visit.visit_date >= :cutoff', { cutoff: cutoffStr })
      .orderBy('visit.visit_date', 'ASC');

    if (query.sku_id) {
      qb.andWhere('li.competitor_sku_id = :sku_id', { sku_id: query.sku_id });
    }

    const items = await qb.getMany();

    // Return daily price data points per SKU
    const grouped = items.reduce<Record<string, any>>((acc, li) => {
      const skuId = li.competitor_sku_id;
      if (!acc[skuId]) {
        acc[skuId] = {
          competitor_sku_id: skuId,
          competitor_sku_name: li.competitor_sku?.name ?? null,
          data_points: [],
        };
      }
      acc[skuId].data_points.push({
        date: (li.invoice as any)?.visit?.visit_date ?? null,
        unit_price: li.unit_price,
      });
      return acc;
    }, {});

    return Object.values(grouped);
  }

  getLatestDigest(): Promise<MarketDigest | null> {
    return this.digestRepo.findOne({
      order: { created_at: 'DESC' },
      where: {},
    });
  }
}
