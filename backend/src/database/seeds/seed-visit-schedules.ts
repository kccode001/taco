/**
 * Seed visit schedules across the demo reps.
 *
 * Adds 2 more demo reps (Budi & Andi) if they don't exist, then attaches
 * a mixed-frequency schedule per available store so the staff demo login
 * has real "today" / "this week" data.
 *
 * Idempotent: safe to re-run. Wipes existing visit_schedules rows then
 * reseeds. Does NOT touch users/stores beyond inserting the 2 demo reps.
 *
 * Run:  npm run seed:visit-schedules
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

import { User, UserRole } from '../entities/user.entity';
import { Store } from '../entities/store.entity';
import { Territory } from '../entities/territory.entity';
import { Pic } from '../entities/pic.entity';
import {
  VisitSchedule,
  VisitScheduleFrequency,
} from '../entities/visit-schedule.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Store, Territory, Pic, VisitSchedule],
  synchronize: false,
});

async function ensureRep(
  usersRepo: any,
  email: string,
  name: string,
  passwordHash: string,
  territoryId: string | null,
): Promise<User> {
  let user = await usersRepo.findOne({ where: { email } });
  if (user) return user;
  user = await usersRepo.save(
    usersRepo.create({
      email,
      password_hash: passwordHash,
      name,
      role: UserRole.REP,
      territory_id: territoryId,
      is_active: true,
    }),
  );
  console.log(`  + created rep ${name} <${email}>`);
  return user;
}

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const usersRepo = ds.getRepository(User);
  const storesRepo = ds.getRepository(Store);
  const schedulesRepo = ds.getRepository(VisitSchedule);

  const passwordHash = await bcrypt.hash('password123', 12);

  // Existing rep is rep@taco.id (Sari Dewi). Add Budi and Andi.
  const sari = await usersRepo.findOne({ where: { email: 'rep@taco.id' } });
  if (!sari) {
    throw new Error('Existing demo rep rep@taco.id missing — run `npm run seed` first.');
  }
  const budi = await ensureRep(usersRepo, 'budi@taco.id', 'Budi Hartono', passwordHash, sari.territory_id);
  const andi = await ensureRep(usersRepo, 'andi@taco.id', 'Andi Wijaya', passwordHash, sari.territory_id);

  const reps = [sari, budi, andi];

  const stores = await storesRepo.find({ where: { is_active: true }, order: { code: 'ASC' } });
  if (stores.length < 5) {
    throw new Error(`Need at least 5 stores; found ${stores.length}.`);
  }

  console.log('Clearing existing visit_schedules...');
  await ds.query('DELETE FROM visit_schedules');

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayDow = today.getDay();

  // Build 5 schedules: one per rep + extras. Mix frequencies; at least one
  // hits "today" for each rep so the demo lands.
  const plans: Array<Partial<VisitSchedule>> = [
    // Sari — daily, fires today
    {
      sales_staff_id: sari.id,
      store_id: stores[0].id,
      frequency: VisitScheduleFrequency.DAILY,
      start_date: todayStr,
      end_date: null,
      active: true,
      notes: 'Daily check-in at flagship store.',
    },
    // Sari — weekly, includes today's weekday
    {
      sales_staff_id: sari.id,
      store_id: stores[1].id,
      frequency: VisitScheduleFrequency.WEEKLY,
      start_date: todayStr,
      end_date: null,
      weekly_days: [todayDow, (todayDow + 3) % 7],
      active: true,
      notes: 'Twice weekly distributor sync.',
    },
    // Budi — weekly Monday only
    {
      sales_staff_id: budi.id,
      store_id: stores[2].id,
      frequency: VisitScheduleFrequency.WEEKLY,
      start_date: todayStr,
      end_date: null,
      weekly_days: [todayDow],
      active: true,
      notes: 'Budi every "today"-weekday visit.',
    },
    // Budi — monthly, last day
    {
      sales_staff_id: budi.id,
      store_id: stores[3].id,
      frequency: VisitScheduleFrequency.MONTHLY,
      start_date: todayStr,
      end_date: null,
      monthly_day: -1,
      active: true,
      notes: 'End-of-month wholesaler review.',
    },
    // Andi — one-time today
    {
      sales_staff_id: andi.id,
      store_id: stores[4].id,
      frequency: VisitScheduleFrequency.ONCE,
      start_date: todayStr,
      end_date: null,
      one_time_date: todayStr,
      active: true,
      notes: 'One-shot product launch visit.',
    },
  ];

  for (const p of plans) {
    await schedulesRepo.save(schedulesRepo.create(p));
  }

  console.log(`Seeded ${plans.length} visit schedules across 3 reps.`);
  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
