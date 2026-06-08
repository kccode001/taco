/**
 * Seed completed visit history so `/visits/history` returns demo-quality data.
 *
 * Per rep: 5–10 submitted Visit rows spread across the last 30 days, hitting
 * the stores already on the rep's visit_schedules. Idempotent — clears any
 * existing visits older than 24h before reseeding so demos stay fresh.
 *
 * Run: npm run seed:visit-history
 */
import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { User, UserRole } from '../entities/user.entity';
import { Store } from '../entities/store.entity';
import { Visit, VisitStatus, VisitSubmissionMethod } from '../entities/visit.entity';
import { VisitSchedule } from '../entities/visit-schedule.entity';
import { Territory } from '../entities/territory.entity';
import { Pic } from '../entities/pic.entity';
import { VisitSection } from '../entities/visit-section.entity';
import { VisitObjective } from '../entities/visit-objective.entity';
import { VisitContext } from '../entities/visit-context.entity';
import { VisitTacoSku } from '../entities/visit-taco-sku.entity';
import { VisitStockLevel } from '../entities/visit-stock-level.entity';
import { VisitPosm } from '../entities/visit-posm.entity';
import { VisitCompetitor } from '../entities/visit-competitor.entity';
import { VisitBurningQuestion } from '../entities/visit-burning-question.entity';
import { VisitSinyalToko } from '../entities/visit-sinyal-toko.entity';
import { TacoSku } from '../entities/taco-sku.entity';
import { PosmAsset } from '../entities/posm-asset.entity';
import { BurningQuestion } from '../entities/burning-question.entity';
import { CompetitorSku } from '../entities/competitor-sku.entity';
import { CompetitorBrand } from '../entities/competitor-brand.entity';
import { VisitCompetitorSku } from '../entities/visit-competitor-sku.entity';
import { VisitCompetitorPromo } from '../entities/visit-competitor-promo.entity';
import { VisitCompetitorPosm } from '../entities/visit-competitor-posm.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Store,
    Visit,
    VisitSchedule,
    Territory,
    Pic,
    VisitSection,
    VisitObjective,
    VisitContext,
    VisitTacoSku,
    VisitStockLevel,
    VisitPosm,
    VisitCompetitor,
    VisitBurningQuestion,
    VisitSinyalToko,
    TacoSku,
    PosmAsset,
    BurningQuestion,
    CompetitorSku,
    CompetitorBrand,
    VisitCompetitorSku,
    VisitCompetitorPromo,
    VisitCompetitorPosm,
  ],
  synchronize: false,
});

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const usersRepo = ds.getRepository(User);
  const storesRepo = ds.getRepository(Store);
  const visitsRepo = ds.getRepository(Visit);
  const schedulesRepo = ds.getRepository(VisitSchedule);

  const reps = await usersRepo.find({ where: { role: UserRole.REP, is_active: true } });
  if (reps.length === 0) {
    throw new Error('No reps found — run npm run seed first.');
  }

  // Reset: drop any visits older than 24h so reseed lands consistently for
  // demo. Recent draft visits stay untouched.
  await ds.query(`DELETE FROM visits WHERE created_at < NOW() - INTERVAL '24 hours'`);

  const allStores = await storesRepo.find({ where: { is_active: true } });
  if (allStores.length === 0) throw new Error('No active stores found.');

  let total = 0;
  for (const rep of reps) {
    const schedules = await schedulesRepo.find({ where: { sales_staff_id: rep.id } });
    const candidateStoreIds = schedules.map((s) => s.store_id);
    const repStores = candidateStoreIds.length > 0
      ? allStores.filter((s) => candidateStoreIds.includes(s.id))
      : allStores.slice(0, 5);

    const targetVisits = 5 + Math.floor(Math.random() * 6); // 5..10
    for (let i = 0; i < targetVisits; i++) {
      const store = repStores[i % repStores.length];
      // Spread back 1..30 days.
      const daysAgo = 1 + Math.floor(Math.random() * 30);
      const day = new Date();
      day.setDate(day.getDate() - daysAgo);
      const visitDate = formatDate(day);
      const submittedAt = new Date(day);
      submittedAt.setHours(10 + Math.floor(Math.random() * 7));

      const v = visitsRepo.create({
        store_id: store.id,
        user_id: rep.id,
        visit_date: visitDate,
        status: VisitStatus.SUBMITTED,
        changed_sections: ['general', 'stock'],
        submitted_at: submittedAt,
        submission_method: VisitSubmissionMethod.MANUAL,
        notable_things: 'Demo seed — owner reported steady demand for HPL panels.',
      });
      await visitsRepo.save(v);
      total++;
    }
    console.log(`  rep ${rep.email} → ${targetVisits} visits`);
  }

  console.log(`Seeded ${total} historical visits across ${reps.length} reps.`);
  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
