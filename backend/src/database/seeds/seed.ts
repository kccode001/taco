import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

import { User, UserRole } from '../entities/user.entity';
import { Territory } from '../entities/territory.entity';
import { Store, StoreType } from '../entities/store.entity';
import { TacoSku, TacoSkuCategory } from '../entities/taco-sku.entity';
import { CompetitorBrand } from '../entities/competitor-brand.entity';
import { CompetitorSku } from '../entities/competitor-sku.entity';
import { BurningQuestion, BurningQuestionScope } from '../entities/burning-question.entity';
import { PosmAsset } from '../entities/posm-asset.entity';
import { VisitObjective } from '../entities/visit-objective.entity';
import { VisitContext } from '../entities/visit-context.entity';
import { VisitSection } from '../entities/visit-section.entity';
import { Visit } from '../entities/visit.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { MarketDigest } from '../entities/market-digest.entity';
import { Pic, PicRole } from '../entities/pic.entity';
import { VisitTacoSku } from '../entities/visit-taco-sku.entity';
import { VisitStockLevel } from '../entities/visit-stock-level.entity';
import { VisitPosm } from '../entities/visit-posm.entity';
import { VisitCompetitor } from '../entities/visit-competitor.entity';
import { VisitCompetitorSku } from '../entities/visit-competitor-sku.entity';
import { VisitCompetitorPromo } from '../entities/visit-competitor-promo.entity';
import { VisitCompetitorPosm } from '../entities/visit-competitor-posm.entity';
import { VisitBurningQuestion } from '../entities/visit-burning-question.entity';
import { VisitSinyalToko } from '../entities/visit-sinyal-toko.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User, Territory, Store, TacoSku, CompetitorBrand, CompetitorSku,
    BurningQuestion, PosmAsset, VisitObjective, VisitContext,
    VisitSection, Visit, InvoiceLineItem, Invoice, MarketDigest,
    Pic, VisitTacoSku, VisitStockLevel, VisitPosm, VisitCompetitor,
    VisitCompetitorSku, VisitCompetitorPromo, VisitCompetitorPosm,
    VisitBurningQuestion, VisitSinyalToko,
  ],
  synchronize: false,
});

async function seed() {
  await ds.initialize();
  console.log('Connected to database.');

  console.log('Clearing tables...');
  // Children first so FK cascades don't matter.
  for (const t of [
    'visit_competitor_posms', 'visit_competitor_promos', 'visit_competitor_skus',
    'visit_competitors', 'visit_burning_questions', 'visit_sinyal_tokos',
    'visit_posms', 'visit_stock_levels', 'visit_taco_skus',
    'visit_visit_contexts', 'visit_pics', 'visit_sections', 'visits',
    'invoice_line_items', 'invoices',
    'pics', 'stores', 'users', 'territories',
    'competitor_skus', 'competitor_brands',
    'taco_skus', 'burning_questions', 'posm_assets',
    'visit_objectives', 'visit_contexts', 'market_digests',
  ]) {
    await ds.query(`DELETE FROM "${t}"`);
  }
  console.log('Tables cleared.');

  const passwordHash = await bcrypt.hash('password123', 12);

  // Territories (Wilayah)
  console.log('Seeding wilayah/territories...');
  const territoryRepo = ds.getRepository(Territory);
  const jabodetabek = await territoryRepo.save(
    territoryRepo.create({ name: 'Jabodetabek', code: 'JBD' }),
  );
  const tangerang = await territoryRepo.save(
    territoryRepo.create({ name: 'Tangerang', code: 'TNG', parent_id: jabodetabek.id }),
  );
  const bekasi = await territoryRepo.save(
    territoryRepo.create({ name: 'Bekasi', code: 'BKS', parent_id: jabodetabek.id }),
  );
  const bandung = await territoryRepo.save(territoryRepo.create({ name: 'Bandung', code: 'BDG' }));
  const surabaya = await territoryRepo.save(
    territoryRepo.create({ name: 'Surabaya', code: 'SBY' }),
  );
  console.log('  Wilayah done: 5');

  // Users
  console.log('Seeding users...');
  const userRepo = ds.getRepository(User);
  const admin = await userRepo.save(
    userRepo.create({
      email: 'admin@taco.id', password_hash: passwordHash, name: 'Admin TACO',
      role: UserRole.ADMIN,
    }),
  );
  const manager = await userRepo.save(
    userRepo.create({
      email: 'manager@taco.id', password_hash: passwordHash, name: 'Budi Santoso',
      role: UserRole.MANAGER, territory_id: jabodetabek.id,
    }),
  );
  const rep = await userRepo.save(
    userRepo.create({
      email: 'rep@taco.id', password_hash: passwordHash, name: 'Sari Dewi',
      role: UserRole.REP, territory_id: tangerang.id,
    }),
  );
  console.log('  Users done: 3');

  // Stores
  console.log('Seeding stores...');
  const storeRepo = ds.getRepository(Store);
  const stores = await storeRepo.save(
    storeRepo.create([
      { code: 'STR-001', name: 'Toko Bangunan Maju Jaya', type: StoreType.STORE,
        region: 'Tangerang', address: 'Jl. Raya Serpong No. 45, Tangerang Selatan',
        territory_id: tangerang.id, assigned_user_id: rep.id },
      { code: 'STR-002', name: 'CV Putra Mandiri', type: StoreType.DISTRIBUTOR,
        region: 'Tangerang', address: 'Jl. Gatot Subroto No. 12, Tangerang',
        territory_id: tangerang.id, assigned_user_id: rep.id },
      { code: 'STR-003', name: 'Workshop Sentosa', type: StoreType.WORKSHOP,
        region: 'Tangerang', address: 'Jl. Industri Raya No. 8, Tangerang',
        territory_id: tangerang.id, assigned_user_id: rep.id },
      { code: 'STR-004', name: 'UD Berkah Abadi', type: StoreType.STORE,
        region: 'Bekasi', address: 'Jl. Ahmad Yani No. 67, Bekasi Utara',
        territory_id: bekasi.id },
      { code: 'STR-005', name: 'PT Sumber Bangunan Bekasi', type: StoreType.DISTRIBUTOR,
        region: 'Bekasi', address: 'Jl. Pekayon Jaya No. 23, Bekasi Selatan',
        territory_id: bekasi.id },
      { code: 'STR-006', name: 'Workshop Karya Indah', type: StoreType.WORKSHOP,
        region: 'Bekasi', address: 'Kawasan Industri MM2100, Bekasi',
        territory_id: bekasi.id },
      { code: 'STR-007', name: 'Toko Bangunan Harapan Baru', type: StoreType.STORE,
        region: 'Bandung', address: 'Jl. Soekarno Hatta No. 112, Bandung',
        territory_id: bandung.id },
      { code: 'STR-008', name: 'UD Mitra Sejati Bandung', type: StoreType.DISTRIBUTOR,
        region: 'Bandung', address: 'Jl. Kiaracondong No. 54, Bandung',
        territory_id: bandung.id },
      { code: 'STR-009', name: 'Bengkel Kayu Prestasi', type: StoreType.WORKSHOP,
        region: 'Bandung', address: 'Jl. Cimahi No. 17, Bandung Barat',
        territory_id: bandung.id },
      { code: 'STR-010', name: 'Toko Material Surya Mas', type: StoreType.STORE,
        region: 'Surabaya', address: 'Jl. Rungkut Industri No. 33, Surabaya',
        territory_id: surabaya.id },
      { code: 'STR-011', name: 'CV Jaya Abadi Surabaya', type: StoreType.DISTRIBUTOR,
        region: 'Surabaya', address: 'Jl. Margomulyo No. 8, Surabaya Barat',
        territory_id: surabaya.id },
      { code: 'STR-012', name: 'Workshop Tiga Berlian', type: StoreType.WORKSHOP,
        region: 'Surabaya', address: 'Jl. Dupak Rukun No. 22, Surabaya',
        territory_id: surabaya.id },
      { code: 'STR-013', name: 'PT Graha Material Jakarta', type: StoreType.DISTRIBUTOR,
        region: 'Jakarta', address: 'Jl. Pangeran Jayakarta No. 77, Jakarta Pusat',
        territory_id: jabodetabek.id },
      { code: 'STR-014', name: 'Toko Interior Elegant', type: StoreType.STORE,
        region: 'Jakarta', address: 'Jl. Pluit Raya No. 45, Jakarta Utara',
        territory_id: jabodetabek.id },
      { code: 'STR-015', name: 'Studio Furniture Nusantara', type: StoreType.WORKSHOP,
        region: 'Jakarta', address: 'Jl. Kemayoran No. 18, Jakarta Pusat',
        territory_id: jabodetabek.id },
    ]),
  );
  console.log(`  Stores done: ${stores.length}`);

  // PICs (multi-PIC per store, demoing 4 roles)
  console.log('Seeding PICs...');
  const picRepo = ds.getRepository(Pic);
  const pics: Pic[] = [];
  for (const s of stores.slice(0, 8)) {
    pics.push(
      picRepo.create({ store_id: s.id, name: 'Pak Hendra', role: PicRole.OWNER, phone: '08123456789', is_primary: true }),
      picRepo.create({ store_id: s.id, name: 'Bu Linda', role: PicRole.PURCHASER, phone: '08129876543' }),
    );
  }
  pics.push(picRepo.create({ store_id: stores[0].id, name: 'Mas Andi', role: PicRole.SALES_STAFF }));
  pics.push(picRepo.create({ store_id: stores[0].id, name: 'Pak Joko', role: PicRole.WAREHOUSE }));
  await picRepo.save(pics);
  // recount
  for (const s of stores) {
    const cnt = pics.filter((p) => p.store_id === s.id).length;
    if (cnt) await storeRepo.update(s.id, { assigned_pic_count: cnt });
  }
  console.log(`  PICs done: ${pics.length}`);

  // TACO SKUs — 9-category enum
  console.log('Seeding TACO SKUs...');
  const skuRepo = ds.getRepository(TacoSku);
  const tacoSkus = await skuRepo.save(
    skuRepo.create([
      { code: 'TK-LAM-001', name: 'TACO Laminate Classic 8mm Oak', category: TacoSkuCategory.LAMINATE, standard_price: 95000, uom: 'lbr' },
      { code: 'TK-LAM-002', name: 'TACO Laminate Classic 8mm Walnut', category: TacoSkuCategory.LAMINATE, standard_price: 95000, uom: 'lbr' },
      { code: 'TK-LAM-003', name: 'TACO Laminate Premium 10mm Oak', category: TacoSkuCategory.LAMINATE, standard_price: 120000, uom: 'lbr' },
      { code: 'TK-LAM-004', name: 'TACO Laminate Premium 10mm Walnut', category: TacoSkuCategory.LAMINATE, standard_price: 120000, uom: 'lbr' },
      { code: 'TK-LAM-005', name: 'TACO Laminate Pro 12mm Oak', category: TacoSkuCategory.LAMINATE, standard_price: 145000, uom: 'lbr' },
      { code: 'TK-HPL-001', name: 'TACO HPL Matte White 0.8mm', category: TacoSkuCategory.HPL, standard_price: 55000, uom: 'lbr' },
      { code: 'TK-HPL-002', name: 'TACO HPL Glossy Teak 1.2mm', category: TacoSkuCategory.HPL, standard_price: 75000, uom: 'lbr' },
      { code: 'TK-HPL-003', name: 'TACO HPL Walnut Premium 1.2mm', category: TacoSkuCategory.HPL, standard_price: 90000, uom: 'lbr' },
      { code: 'TK-ECO-001', name: 'TACO ECO HPL White 0.7mm', category: TacoSkuCategory.ECO_HPL, standard_price: 38000, uom: 'lbr' },
      { code: 'TK-ECO-002', name: 'TACO ECO HPL Sonokeling 0.7mm', category: TacoSkuCategory.ECO_HPL, standard_price: 42000, uom: 'lbr' },
      { code: 'TK-SHT-001', name: 'TACO Sheet Deco Oak 18mm', category: TacoSkuCategory.SHEET, standard_price: 95000, uom: 'lbr' },
      { code: 'TK-SHT-002', name: 'TACO Sheet Premium Marble 18mm', category: TacoSkuCategory.SHEET, standard_price: 108000, uom: 'lbr' },
      { code: 'TK-EDG-001', name: 'TACO Edging PVC Oak 22mm', category: TacoSkuCategory.EDGING, standard_price: 8000, uom: 'mtr' },
      { code: 'TK-EDG-002', name: 'TACO Edging ABS White 0.8mm', category: TacoSkuCategory.EDGING, standard_price: 11000, uom: 'mtr' },
      { code: 'TK-HRD-001', name: 'TACO Hardware Engsel Soft Close 35mm', category: TacoSkuCategory.HARDWARE, standard_price: 32000, uom: 'pcs' },
      { code: 'TK-HRD-002', name: 'TACO Hardware Laci Full Extension 45cm', category: TacoSkuCategory.HARDWARE, standard_price: 75000, uom: 'pcs' },
      { code: 'TK-VNL-001', name: 'TACO Vinyl Plank Oak 3mm', category: TacoSkuCategory.VINYL, standard_price: 85000, uom: 'lbr' },
      { code: 'TK-VNL-002', name: 'TACO Vinyl Plank Premium 5mm SPC', category: TacoSkuCategory.VINYL, standard_price: 115000, uom: 'lbr' },
      { code: 'TK-PLY-001', name: 'TACO Plywood Sengon 12mm', category: TacoSkuCategory.PLYWOOD, standard_price: 220000, uom: 'lbr' },
      { code: 'TK-PLY-002', name: 'TACO Plywood Marine BWP 18mm', category: TacoSkuCategory.PLYWOOD, standard_price: 345000, uom: 'lbr' },
      { code: 'TK-LNY-001', name: 'TACO Aksesori Lainnya', category: TacoSkuCategory.LAINNYA, standard_price: 25000, uom: 'pcs' },
    ]),
  );
  console.log(`  TACO SKUs done: ${tacoSkus.length}`);

  // Competitor Brands — 10 per design 02 E
  console.log('Seeding competitor brands...');
  const brandRepo = ds.getRepository(CompetitorBrand);
  const brandNames = [
    'Krono', 'Kronospan', 'Pergo', 'Egger', 'Unilin',
    'Armstrong', 'Teka', 'Greenply', 'Meranti', 'Lainnya',
  ];
  const brands = await brandRepo.save(
    brandRepo.create(brandNames.map((name) => ({ name, is_active: true }))),
  );
  const brandMap: Record<string, CompetitorBrand> = {};
  for (const b of brands) brandMap[b.name] = b;
  console.log(`  Competitor brands done: ${brands.length}`);

  // Competitor SKUs (slim sample, brand-attributed)
  console.log('Seeding competitor SKUs...');
  const cskuRepo = ds.getRepository(CompetitorSku);
  const cskus = await cskuRepo.save(
    cskuRepo.create([
      { brand_id: brandMap['Krono'].id, name: 'Krono Original 8mm AC4', category: 'Laminate' },
      { brand_id: brandMap['Krono'].id, name: 'Krono Aqua Stop 8mm', category: 'Laminate' },
      { brand_id: brandMap['Kronospan'].id, name: 'Kronospan Vintage 10mm', category: 'Laminate' },
      { brand_id: brandMap['Pergo'].id, name: 'Pergo Sensation Oak', category: 'Laminate' },
      { brand_id: brandMap['Egger'].id, name: 'Egger Pro Laminate 8mm', category: 'Laminate' },
      { brand_id: brandMap['Egger'].id, name: 'Egger HPL Matte', category: 'HPL' },
      { brand_id: brandMap['Unilin'].id, name: 'Unilin Livyn Vinyl', category: 'Vinyl' },
      { brand_id: brandMap['Armstrong'].id, name: 'Armstrong Luxury Vinyl', category: 'Vinyl' },
      { brand_id: brandMap['Teka'].id, name: 'Teka HPL Putih Doff', category: 'HPL' },
      { brand_id: brandMap['Greenply'].id, name: 'Greenply MDF 18mm', category: 'Plywood' },
      { brand_id: brandMap['Meranti'].id, name: 'Meranti Plywood 12mm', category: 'Plywood' },
    ]),
  );
  console.log(`  Competitor SKUs done: ${cskus.length}`);

  // Burning Questions
  console.log('Seeding burning questions...');
  const bqRepo = ds.getRepository(BurningQuestion);
  const bqs = await bqRepo.save(
    bqRepo.create([
      { text: 'Apakah ada perubahan distributor utama di toko ini dalam 30 hari terakhir?',
        scope: BurningQuestionScope.COMPANY, is_active: true },
      { text: 'Produk TACO apa yang paling sering ditanyakan customer bulan ini?',
        scope: BurningQuestionScope.COMPANY, is_active: true },
      { text: 'Apakah ada produk kompetitor baru yang masuk ke toko dalam 2 minggu terakhir?',
        scope: BurningQuestionScope.REGION, is_active: true },
    ]),
  );
  console.log(`  Burning questions done: ${bqs.length}`);

  // POSM Assets
  console.log('Seeding POSM assets...');
  const posmRepo = ds.getRepository(PosmAsset);
  const posms = await posmRepo.save(
    posmRepo.create([
      { name: 'Standing Banner', category: 'Banner', is_required: true, is_active: true },
      { name: 'Shelf Strip', category: 'Shelf', is_required: true, is_active: true },
      { name: 'Price Tag Holder', category: 'Pricing', is_required: true, is_active: true },
      { name: 'Poster A2', category: 'Poster', is_required: false, is_active: true },
      { name: 'Product Tester Display', category: 'Display', is_required: false, is_active: true },
      { name: 'Leaflet Display', category: 'Print', is_required: false, is_active: true },
    ]),
  );
  console.log(`  POSM assets done: ${posms.length}`);

  // Visit Objectives — admin-managed list (AC-24)
  console.log('Seeding visit objectives...');
  const voRepo = ds.getRepository(VisitObjective);
  const objectives = await voRepo.save(
    voRepo.create([
      { name: 'Kunjungan Rutin', description: 'Kunjungan terjadwal rutin.', sort_order: 1, is_active: true },
      { name: 'Follow-up Stok', description: 'Tindak lanjut ketersediaan stok.', sort_order: 2, is_active: true },
      { name: 'Pengenalan Produk Baru', description: 'Sosialisasi produk baru.', sort_order: 3, is_active: true },
      { name: 'Audit Display POSM', description: 'Cek kelengkapan POSM.', sort_order: 4, is_active: true },
    ]),
  );
  console.log(`  Visit objectives done: ${objectives.length}`);

  // Visit Contexts — matches design 02 C
  console.log('Seeding visit contexts...');
  const vcRepo = ds.getRepository(VisitContext);
  const contexts = await vcRepo.save(
    vcRepo.create([
      { name: 'Ada pertemuan khusus', sort_order: 1, is_active: true },
      { name: 'Toko ramai', sort_order: 2, is_active: true },
      { name: 'Kunjungan singkat', sort_order: 3, is_active: true },
    ]),
  );
  console.log(`  Visit contexts done: ${contexts.length}`);

  console.log('\nSeed complete.');
  console.log('Summary:');
  console.log(`  Wilayah         : 5`);
  console.log(`  Users           : 3  (admin/manager/rep — password: password123)`);
  console.log(`  Stores          : ${stores.length}`);
  console.log(`  PICs            : ${pics.length}`);
  console.log(`  TACO SKUs       : ${tacoSkus.length}  (9-cat enum)`);
  console.log(`  Comp. Brands    : ${brands.length}  (10 incl. Kronospan/Lainnya)`);
  console.log(`  Comp. SKUs      : ${cskus.length}`);
  console.log(`  Burning Qs      : ${bqs.length}`);
  console.log(`  POSM Assets     : ${posms.length}`);
  console.log(`  Visit Obj.      : ${objectives.length}`);
  console.log(`  Visit Ctx.      : ${contexts.length}`);

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
