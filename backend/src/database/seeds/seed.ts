import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

import { User, UserRole } from '../entities/user.entity';
import { Territory } from '../entities/territory.entity';
import { Store, StoreType } from '../entities/store.entity';
import { TacoSku } from '../entities/taco-sku.entity';
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

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Territory,
    Store,
    TacoSku,
    CompetitorBrand,
    CompetitorSku,
    BurningQuestion,
    PosmAsset,
    VisitObjective,
    VisitContext,
    VisitSection,
    Visit,
    InvoiceLineItem,
    Invoice,
    MarketDigest,
  ],
  synchronize: false,
});

async function seed() {
  await ds.initialize();
  console.log('Connected to database.');

  // ── 1. Clear tables in FK-safe order ──────────────────────────────────────
  console.log('Clearing tables...');
  await ds.query('DELETE FROM invoice_line_items');
  await ds.query('DELETE FROM invoices');
  await ds.query('DELETE FROM visit_sections');
  await ds.query('DELETE FROM visits');
  await ds.query('DELETE FROM stores');
  await ds.query('DELETE FROM users');
  await ds.query('DELETE FROM territories');
  await ds.query('DELETE FROM taco_skus');
  await ds.query('DELETE FROM competitor_skus');
  await ds.query('DELETE FROM competitor_brands');
  await ds.query('DELETE FROM burning_questions');
  await ds.query('DELETE FROM posm_assets');
  await ds.query('DELETE FROM visit_objectives');
  await ds.query('DELETE FROM visit_contexts');
  await ds.query('DELETE FROM market_digests');
  console.log('Tables cleared.');

  const passwordHash = await bcrypt.hash('password123', 12);

  // ── 2. Territories ─────────────────────────────────────────────────────────
  console.log('Seeding territories...');
  const territoryRepo = ds.getRepository(Territory);

  const jabodetabek = territoryRepo.create({ name: 'Jabodetabek', code: 'JBD' });
  await territoryRepo.save(jabodetabek);

  const tangerang = territoryRepo.create({ name: 'Tangerang', code: 'TNG', parent_id: jabodetabek.id });
  const bekasi = territoryRepo.create({ name: 'Bekasi', code: 'BKS', parent_id: jabodetabek.id });
  const bandung = territoryRepo.create({ name: 'Bandung', code: 'BDG' });
  const surabaya = territoryRepo.create({ name: 'Surabaya', code: 'SBY' });
  await territoryRepo.save([tangerang, bekasi, bandung, surabaya]);
  console.log('  Territories done: 5');

  // ── 3. Users ───────────────────────────────────────────────────────────────
  console.log('Seeding users...');
  const userRepo = ds.getRepository(User);

  const admin = userRepo.create({
    email: 'admin@taco.id',
    password_hash: passwordHash,
    name: 'Admin TACO',
    role: UserRole.ADMIN,
  });

  const manager = userRepo.create({
    email: 'manager@taco.id',
    password_hash: passwordHash,
    name: 'Budi Santoso',
    role: UserRole.MANAGER,
    territory_id: jabodetabek.id,
  });

  const rep = userRepo.create({
    email: 'rep@taco.id',
    password_hash: passwordHash,
    name: 'Sari Dewi',
    role: UserRole.REP,
    territory_id: tangerang.id,
  });

  await userRepo.save([admin, manager, rep]);
  console.log('  Users done: 3');

  // ── 4. Stores ──────────────────────────────────────────────────────────────
  console.log('Seeding stores...');
  const storeRepo = ds.getRepository(Store);

  const stores = storeRepo.create([
    // Tangerang (3) — assigned to Sari Dewi
    {
      code: 'STR-001',
      name: 'Toko Bangunan Maju Jaya',
      type: StoreType.STORE,
      region: 'Tangerang',
      address: 'Jl. Raya Serpong No. 45, Tangerang Selatan',
      territory_id: tangerang.id,
      assigned_user_id: rep.id,
    },
    {
      code: 'STR-002',
      name: 'CV Putra Mandiri',
      type: StoreType.DISTRIBUTOR,
      region: 'Tangerang',
      address: 'Jl. Gatot Subroto No. 12, Tangerang',
      territory_id: tangerang.id,
      assigned_user_id: rep.id,
    },
    {
      code: 'STR-003',
      name: 'Workshop Sentosa',
      type: StoreType.WORKSHOP,
      region: 'Tangerang',
      address: 'Jl. Industri Raya No. 8, Tangerang',
      territory_id: tangerang.id,
      assigned_user_id: rep.id,
    },

    // Bekasi (3)
    {
      code: 'STR-004',
      name: 'UD Berkah Abadi',
      type: StoreType.STORE,
      region: 'Bekasi',
      address: 'Jl. Ahmad Yani No. 67, Bekasi Utara',
      territory_id: bekasi.id,
    },
    {
      code: 'STR-005',
      name: 'PT Sumber Bangunan Bekasi',
      type: StoreType.DISTRIBUTOR,
      region: 'Bekasi',
      address: 'Jl. Pekayon Jaya No. 23, Bekasi Selatan',
      territory_id: bekasi.id,
    },
    {
      code: 'STR-006',
      name: 'Workshop Karya Indah',
      type: StoreType.WORKSHOP,
      region: 'Bekasi',
      address: 'Kawasan Industri MM2100, Bekasi',
      territory_id: bekasi.id,
    },

    // Bandung (3)
    {
      code: 'STR-007',
      name: 'Toko Bangunan Harapan Baru',
      type: StoreType.STORE,
      region: 'Bandung',
      address: 'Jl. Soekarno Hatta No. 112, Bandung',
      territory_id: bandung.id,
    },
    {
      code: 'STR-008',
      name: 'UD Mitra Sejati Bandung',
      type: StoreType.DISTRIBUTOR,
      region: 'Bandung',
      address: 'Jl. Kiaracondong No. 54, Bandung',
      territory_id: bandung.id,
    },
    {
      code: 'STR-009',
      name: 'Bengkel Kayu Prestasi',
      type: StoreType.WORKSHOP,
      region: 'Bandung',
      address: 'Jl. Cimahi No. 17, Bandung Barat',
      territory_id: bandung.id,
    },

    // Surabaya (3)
    {
      code: 'STR-010',
      name: 'Toko Material Surya Mas',
      type: StoreType.STORE,
      region: 'Surabaya',
      address: 'Jl. Rungkut Industri No. 33, Surabaya',
      territory_id: surabaya.id,
    },
    {
      code: 'STR-011',
      name: 'CV Jaya Abadi Surabaya',
      type: StoreType.DISTRIBUTOR,
      region: 'Surabaya',
      address: 'Jl. Margomulyo No. 8, Surabaya Barat',
      territory_id: surabaya.id,
    },
    {
      code: 'STR-012',
      name: 'Workshop Tiga Berlian',
      type: StoreType.WORKSHOP,
      region: 'Surabaya',
      address: 'Jl. Dupak Rukun No. 22, Surabaya',
      territory_id: surabaya.id,
    },

    // General / Jakarta (3)
    {
      code: 'STR-013',
      name: 'PT Graha Material Jakarta',
      type: StoreType.DISTRIBUTOR,
      region: 'Jakarta',
      address: 'Jl. Pangeran Jayakarta No. 77, Jakarta Pusat',
      territory_id: jabodetabek.id,
    },
    {
      code: 'STR-014',
      name: 'Toko Interior Elegant',
      type: StoreType.STORE,
      region: 'Jakarta',
      address: 'Jl. Pluit Raya No. 45, Jakarta Utara',
      territory_id: jabodetabek.id,
    },
    {
      code: 'STR-015',
      name: 'Studio Furniture Nusantara',
      type: StoreType.WORKSHOP,
      region: 'Jakarta',
      address: 'Jl. Kemayoran No. 18, Jakarta Pusat',
      territory_id: jabodetabek.id,
    },
  ]);

  await storeRepo.save(stores);
  console.log('  Stores done: 15');

  // ── 5. TACO SKUs ──────────────────────────────────────────────────────────
  console.log('Seeding TACO SKUs...');
  const skuRepo = ds.getRepository(TacoSku);

  const tacoSkus = skuRepo.create([
    // Laminate (10) — 85000–150000
    { code: 'TK-LAM-001', name: 'TACO Laminate Classic 8mm Oak', category: 'Laminate', standard_price: 95000, uom: 'lbr' },
    { code: 'TK-LAM-002', name: 'TACO Laminate Classic 8mm Walnut', category: 'Laminate', standard_price: 95000, uom: 'lbr' },
    { code: 'TK-LAM-003', name: 'TACO Laminate Premium 10mm Oak', category: 'Laminate', standard_price: 120000, uom: 'lbr' },
    { code: 'TK-LAM-004', name: 'TACO Laminate Premium 10mm Walnut', category: 'Laminate', standard_price: 120000, uom: 'lbr' },
    { code: 'TK-LAM-005', name: 'TACO Laminate Premium 10mm Cherry', category: 'Laminate', standard_price: 125000, uom: 'lbr' },
    { code: 'TK-LAM-006', name: 'TACO Laminate Aqua 8mm Teak', category: 'Laminate', standard_price: 110000, uom: 'lbr' },
    { code: 'TK-LAM-007', name: 'TACO Laminate Aqua 8mm Maple', category: 'Laminate', standard_price: 110000, uom: 'lbr' },
    { code: 'TK-LAM-008', name: 'TACO Laminate Pro 12mm Oak', category: 'Laminate', standard_price: 145000, uom: 'lbr' },
    { code: 'TK-LAM-009', name: 'TACO Laminate Pro 12mm Walnut', category: 'Laminate', standard_price: 145000, uom: 'lbr' },
    { code: 'TK-LAM-010', name: 'TACO Laminate Vintage 8mm Grey Oak', category: 'Laminate', standard_price: 105000, uom: 'lbr' },

    // HPL (10) — 45000–95000
    { code: 'TK-HPL-001', name: 'TACO HPL Matte White 0.8mm', category: 'HPL', standard_price: 55000, uom: 'lbr' },
    { code: 'TK-HPL-002', name: 'TACO HPL Matte Cream 0.8mm', category: 'HPL', standard_price: 55000, uom: 'lbr' },
    { code: 'TK-HPL-003', name: 'TACO HPL Glossy White 0.8mm', category: 'HPL', standard_price: 60000, uom: 'lbr' },
    { code: 'TK-HPL-004', name: 'TACO HPL Glossy Teak 1.2mm', category: 'HPL', standard_price: 75000, uom: 'lbr' },
    { code: 'TK-HPL-005', name: 'TACO HPL Kayu Jati 1.2mm', category: 'HPL', standard_price: 78000, uom: 'lbr' },
    { code: 'TK-HPL-006', name: 'TACO HPL Motif Batu 1.2mm', category: 'HPL', standard_price: 82000, uom: 'lbr' },
    { code: 'TK-HPL-007', name: 'TACO HPL Grey Stone 1.2mm', category: 'HPL', standard_price: 82000, uom: 'lbr' },
    { code: 'TK-HPL-008', name: 'TACO HPL Black Matte 0.8mm', category: 'HPL', standard_price: 65000, uom: 'lbr' },
    { code: 'TK-HPL-009', name: 'TACO HPL Walnut Premium 1.2mm', category: 'HPL', standard_price: 90000, uom: 'lbr' },
    { code: 'TK-HPL-010', name: 'TACO HPL Satin Silver 0.8mm', category: 'HPL', standard_price: 70000, uom: 'lbr' },

    // ECO HPL (9) — 35000–70000
    { code: 'TK-ECO-001', name: 'TACO ECO HPL White 0.7mm', category: 'ECO HPL', standard_price: 38000, uom: 'lbr' },
    { code: 'TK-ECO-002', name: 'TACO ECO HPL Cream 0.7mm', category: 'ECO HPL', standard_price: 38000, uom: 'lbr' },
    { code: 'TK-ECO-003', name: 'TACO ECO HPL Kayu Sungkai 0.7mm', category: 'ECO HPL', standard_price: 42000, uom: 'lbr' },
    { code: 'TK-ECO-004', name: 'TACO ECO HPL Sonokeling 0.7mm', category: 'ECO HPL', standard_price: 42000, uom: 'lbr' },
    { code: 'TK-ECO-005', name: 'TACO ECO HPL Teak Natural 0.8mm', category: 'ECO HPL', standard_price: 48000, uom: 'lbr' },
    { code: 'TK-ECO-006', name: 'TACO ECO HPL Grey 0.7mm', category: 'ECO HPL', standard_price: 40000, uom: 'lbr' },
    { code: 'TK-ECO-007', name: 'TACO ECO HPL Batu Alam 0.8mm', category: 'ECO HPL', standard_price: 50000, uom: 'lbr' },
    { code: 'TK-ECO-008', name: 'TACO ECO HPL Marmer Putih 0.8mm', category: 'ECO HPL', standard_price: 52000, uom: 'lbr' },
    { code: 'TK-ECO-009', name: 'TACO ECO HPL Solid Merah 0.7mm', category: 'ECO HPL', standard_price: 36000, uom: 'lbr' },

    // Sheet (9) — 55000–110000
    { code: 'TK-SHT-001', name: 'TACO Sheet Deco Oak 18mm', category: 'Sheet', standard_price: 95000, uom: 'lbr' },
    { code: 'TK-SHT-002', name: 'TACO Sheet Deco Walnut 18mm', category: 'Sheet', standard_price: 95000, uom: 'lbr' },
    { code: 'TK-SHT-003', name: 'TACO Sheet Deco White 18mm', category: 'Sheet', standard_price: 85000, uom: 'lbr' },
    { code: 'TK-SHT-004', name: 'TACO Sheet Deco Teak 18mm', category: 'Sheet', standard_price: 100000, uom: 'lbr' },
    { code: 'TK-SHT-005', name: 'TACO Sheet Deco Grey 18mm', category: 'Sheet', standard_price: 90000, uom: 'lbr' },
    { code: 'TK-SHT-006', name: 'TACO Sheet Plain White 18mm', category: 'Sheet', standard_price: 75000, uom: 'lbr' },
    { code: 'TK-SHT-007', name: 'TACO Sheet Plain Cream 18mm', category: 'Sheet', standard_price: 75000, uom: 'lbr' },
    { code: 'TK-SHT-008', name: 'TACO Sheet Premium Marble 18mm', category: 'Sheet', standard_price: 108000, uom: 'lbr' },
    { code: 'TK-SHT-009', name: 'TACO Sheet Premium Granite 18mm', category: 'Sheet', standard_price: 108000, uom: 'lbr' },

    // Edging (9) — 5000–25000
    { code: 'TK-EDG-001', name: 'TACO Edging PVC Oak 22mm', category: 'Edging', standard_price: 8000, uom: 'mtr' },
    { code: 'TK-EDG-002', name: 'TACO Edging PVC Walnut 22mm', category: 'Edging', standard_price: 8000, uom: 'mtr' },
    { code: 'TK-EDG-003', name: 'TACO Edging PVC White 22mm', category: 'Edging', standard_price: 7000, uom: 'mtr' },
    { code: 'TK-EDG-004', name: 'TACO Edging PVC Teak 22mm', category: 'Edging', standard_price: 8000, uom: 'mtr' },
    { code: 'TK-EDG-005', name: 'TACO Edging ABS Oak 0.8mm', category: 'Edging', standard_price: 12000, uom: 'mtr' },
    { code: 'TK-EDG-006', name: 'TACO Edging ABS White 0.8mm', category: 'Edging', standard_price: 11000, uom: 'mtr' },
    { code: 'TK-EDG-007', name: 'TACO Edging ABS Walnut 1.0mm', category: 'Edging', standard_price: 14000, uom: 'mtr' },
    { code: 'TK-EDG-008', name: 'TACO Edging Veneer Oak 0.6mm', category: 'Edging', standard_price: 20000, uom: 'mtr' },
    { code: 'TK-EDG-009', name: 'TACO Edging Veneer Teak 0.6mm', category: 'Edging', standard_price: 22000, uom: 'mtr' },

    // Hardware (9) — 15000–85000
    { code: 'TK-HRD-001', name: 'TACO Hardware Engsel Sendok 35mm', category: 'Hardware', standard_price: 18000, uom: 'pcs' },
    { code: 'TK-HRD-002', name: 'TACO Hardware Engsel Sendok Soft Close 35mm', category: 'Hardware', standard_price: 32000, uom: 'pcs' },
    { code: 'TK-HRD-003', name: 'TACO Hardware Laci Full Extension 45cm', category: 'Hardware', standard_price: 75000, uom: 'pcs' },
    { code: 'TK-HRD-004', name: 'TACO Hardware Laci Soft Close 45cm', category: 'Hardware', standard_price: 85000, uom: 'pcs' },
    { code: 'TK-HRD-005', name: 'TACO Hardware Rel Pintu Geser', category: 'Hardware', standard_price: 65000, uom: 'set' },
    { code: 'TK-HRD-006', name: 'TACO Hardware Handle Pintu Aluminium', category: 'Hardware', standard_price: 28000, uom: 'pcs' },
    { code: 'TK-HRD-007', name: 'TACO Hardware Kaki Lemari Adjustable', category: 'Hardware', standard_price: 15000, uom: 'pcs' },
    { code: 'TK-HRD-008', name: 'TACO Hardware Cam Lock 15mm', category: 'Hardware', standard_price: 5000, uom: 'pcs' },
    { code: 'TK-HRD-009', name: 'TACO Hardware Dowel Pin 8mm', category: 'Hardware', standard_price: 2000, uom: 'pcs' },

    // Vinyl (9) — 65000–120000
    { code: 'TK-VNL-001', name: 'TACO Vinyl Plank Oak 3mm', category: 'Vinyl', standard_price: 85000, uom: 'lbr' },
    { code: 'TK-VNL-002', name: 'TACO Vinyl Plank Walnut 3mm', category: 'Vinyl', standard_price: 85000, uom: 'lbr' },
    { code: 'TK-VNL-003', name: 'TACO Vinyl Plank Teak 3mm', category: 'Vinyl', standard_price: 88000, uom: 'lbr' },
    { code: 'TK-VNL-004', name: 'TACO Vinyl Plank Grey Oak 4mm', category: 'Vinyl', standard_price: 98000, uom: 'lbr' },
    { code: 'TK-VNL-005', name: 'TACO Vinyl Plank Premium 5mm SPC', category: 'Vinyl', standard_price: 115000, uom: 'lbr' },
    { code: 'TK-VNL-006', name: 'TACO Vinyl Tile Marble 3mm', category: 'Vinyl', standard_price: 75000, uom: 'lbr' },
    { code: 'TK-VNL-007', name: 'TACO Vinyl Tile Granite 3mm', category: 'Vinyl', standard_price: 75000, uom: 'lbr' },
    { code: 'TK-VNL-008', name: 'TACO Vinyl Tile Limestone 3mm', category: 'Vinyl', standard_price: 78000, uom: 'lbr' },
    { code: 'TK-VNL-009', name: 'TACO Vinyl Commercial Anti-Slip 3mm', category: 'Vinyl', standard_price: 68000, uom: 'lbr' },

    // Plywood (10) — 180000–350000
    { code: 'TK-PLY-001', name: 'TACO Plywood Sengon 9mm', category: 'Plywood', standard_price: 185000, uom: 'lbr' },
    { code: 'TK-PLY-002', name: 'TACO Plywood Sengon 12mm', category: 'Plywood', standard_price: 220000, uom: 'lbr' },
    { code: 'TK-PLY-003', name: 'TACO Plywood Sengon 15mm', category: 'Plywood', standard_price: 265000, uom: 'lbr' },
    { code: 'TK-PLY-004', name: 'TACO Plywood Sengon 18mm', category: 'Plywood', standard_price: 295000, uom: 'lbr' },
    { code: 'TK-PLY-005', name: 'TACO Plywood Meranti 12mm', category: 'Plywood', standard_price: 240000, uom: 'lbr' },
    { code: 'TK-PLY-006', name: 'TACO Plywood Meranti 18mm', category: 'Plywood', standard_price: 320000, uom: 'lbr' },
    { code: 'TK-PLY-007', name: 'TACO Plywood Marine BWP 18mm', category: 'Plywood', standard_price: 345000, uom: 'lbr' },
    { code: 'TK-PLY-008', name: 'TACO MDF Standard 12mm', category: 'Plywood', standard_price: 195000, uom: 'lbr' },
    { code: 'TK-PLY-009', name: 'TACO MDF Standard 18mm', category: 'Plywood', standard_price: 245000, uom: 'lbr' },
    { code: 'TK-PLY-010', name: 'TACO Block Board Sengon 18mm', category: 'Plywood', standard_price: 285000, uom: 'lbr' },
  ]);

  await skuRepo.save(tacoSkus);
  console.log(`  TACO SKUs done: ${tacoSkus.length}`);

  // ── 6. Competitor Brands ───────────────────────────────────────────────────
  console.log('Seeding competitor brands...');
  const brandRepo = ds.getRepository(CompetitorBrand);

  const brandNames = ['Krono', 'Pergo', 'Egger', 'Unilin', 'Armstrong', 'Teka', 'Greenply', 'Meranti / Sengon'];
  const brands: CompetitorBrand[] = [];
  for (const name of brandNames) {
    const b = brandRepo.create({ name, is_active: true });
    brands.push(b);
  }
  await brandRepo.save(brands);

  const brandMap: Record<string, CompetitorBrand> = {};
  for (const b of brands) {
    brandMap[b.name] = b;
  }
  console.log(`  Competitor brands done: ${brands.length}`);

  // ── 7. Competitor SKUs ─────────────────────────────────────────────────────
  console.log('Seeding competitor SKUs...');
  const cskuRepo = ds.getRepository(CompetitorSku);

  // Helper: find TACO SKU by partial name match for rough mapping
  const findTacoSku = (keyword: string): string | undefined => {
    const kw = keyword.toLowerCase();
    return tacoSkus.find((s) => s.name.toLowerCase().includes(kw))?.id;
  };

  const competitorSkus = cskuRepo.create([
    // Krono (8) — Laminate
    { brand_id: brandMap['Krono'].id, name: 'Krono Original 8mm AC4', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm oak') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Original 12mm AC5', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate pro 12mm') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Style 10mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm oak') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Aqua Stop 8mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate aqua 8mm') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Vintage 8mm Oak', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate vintage') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Classic 8mm Walnut', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm walnut') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Premium 10mm Beech', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm walnut') },
    { brand_id: brandMap['Krono'].id, name: 'Krono Pro 12mm Cherry', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate pro 12mm walnut') },

    // Pergo (6) — Laminate
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Sensation Oak', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm oak') },
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Premier Beech', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm walnut') },
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Original Excellence', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate pro 12mm oak') },
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Limed Oak', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm oak') },
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Grey Oak', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate vintage') },
    { brand_id: brandMap['Pergo'].id, name: 'Pergo Natural Ash', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm cherry') },

    // Egger (6) — Laminate & HPL
    { brand_id: brandMap['Egger'].id, name: 'Egger Pro Laminate 8mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm oak') },
    { brand_id: brandMap['Egger'].id, name: 'Egger Pro Laminate 10mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm oak') },
    { brand_id: brandMap['Egger'].id, name: 'Egger HPL Matte', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl matte white') },
    { brand_id: brandMap['Egger'].id, name: 'Egger HPL Gloss', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl glossy white') },
    { brand_id: brandMap['Egger'].id, name: 'Egger Aqua Plus 8mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate aqua 8mm') },
    { brand_id: brandMap['Egger'].id, name: 'Egger Kingsize 12mm', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate pro 12mm oak') },

    // Unilin / Quick-Step (4) — Laminate & Vinyl
    { brand_id: brandMap['Unilin'].id, name: 'Unilin Impressive Oak', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm oak') },
    { brand_id: brandMap['Unilin'].id, name: 'Unilin Livyn Vinyl', category: 'Vinyl', mapped_taco_sku_id: findTacoSku('vinyl plank oak') },
    { brand_id: brandMap['Unilin'].id, name: 'Quick-Step Impressive', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate premium 10mm walnut') },
    { brand_id: brandMap['Unilin'].id, name: 'Quick-Step Classic', category: 'Laminate', mapped_taco_sku_id: findTacoSku('laminate classic 8mm oak') },

    // Armstrong (4) — Vinyl
    { brand_id: brandMap['Armstrong'].id, name: 'Armstrong Vinyl Tile', category: 'Vinyl', mapped_taco_sku_id: findTacoSku('vinyl tile marble') },
    { brand_id: brandMap['Armstrong'].id, name: 'Armstrong Vinyl Plank', category: 'Vinyl', mapped_taco_sku_id: findTacoSku('vinyl plank oak') },
    { brand_id: brandMap['Armstrong'].id, name: 'Armstrong Luxury Vinyl', category: 'Vinyl', mapped_taco_sku_id: findTacoSku('vinyl plank premium 5mm') },
    { brand_id: brandMap['Armstrong'].id, name: 'Armstrong Commercial Vinyl', category: 'Vinyl', mapped_taco_sku_id: findTacoSku('vinyl commercial') },

    // Teka (8) — HPL
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Putih Doff', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl matte white') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Kayu Natural', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl kayu jati') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Grey Stone', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl grey stone') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL White Glossy', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl glossy white') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Motif Batu', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl motif batu') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Kayu Jati', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl kayu jati') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Black Matte', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl black matte') },
    { brand_id: brandMap['Teka'].id, name: 'Teka HPL Cream Satin', category: 'HPL', mapped_taco_sku_id: findTacoSku('hpl matte cream') },

    // Greenply (6) — Plywood / MDF
    { brand_id: brandMap['Greenply'].id, name: 'Greenply Plywood 18mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood meranti 18mm') },
    { brand_id: brandMap['Greenply'].id, name: 'Greenply MDF 12mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('mdf standard 12mm') },
    { brand_id: brandMap['Greenply'].id, name: 'Greenply MDF 18mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('mdf standard 18mm') },
    { brand_id: brandMap['Greenply'].id, name: 'Greenply BWP Marine', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood marine') },
    { brand_id: brandMap['Greenply'].id, name: 'Greenply Commercial 12mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood meranti 12mm') },
    { brand_id: brandMap['Greenply'].id, name: 'Greenply Flexi Ply', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood sengon 9mm') },

    // Meranti / Sengon (8) — Plywood / MDF
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Meranti Plywood 9mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood sengon 9mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Meranti Plywood 12mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood sengon 12mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Meranti Plywood 18mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood sengon 18mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Sengon MDF 9mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('mdf standard 12mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Sengon MDF 12mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('mdf standard 12mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Sengon Plywood 12mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood sengon 12mm') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Sengon Marine Plywood', category: 'Plywood', mapped_taco_sku_id: findTacoSku('plywood marine') },
    { brand_id: brandMap['Meranti / Sengon'].id, name: 'Sengon Block Board 18mm', category: 'Plywood', mapped_taco_sku_id: findTacoSku('block board') },
  ]);

  await cskuRepo.save(competitorSkus);
  console.log(`  Competitor SKUs done: ${competitorSkus.length}`);

  // ── 8. Burning Questions ───────────────────────────────────────────────────
  console.log('Seeding burning questions...');
  const bqRepo = ds.getRepository(BurningQuestion);

  const bqs = bqRepo.create([
    {
      text: 'Apakah ada perubahan distributor utama di toko ini dalam 30 hari terakhir?',
      scope: BurningQuestionScope.COMPANY,
      is_active: true,
    },
    {
      text: 'Produk TACO apa yang paling sering ditanyakan customer bulan ini? Sebutkan maksimal 3 SKU.',
      scope: BurningQuestionScope.COMPANY,
      is_active: true,
    },
    {
      text: 'Apakah ada produk kompetitor baru yang masuk ke toko dalam 2 minggu terakhir? Sebutkan nama produk dan harganya.',
      scope: BurningQuestionScope.REGION,
      is_active: true,
    },
    {
      text: 'Bagaimana kondisi dan posisi display produk TACO dibandingkan kompetitor di toko ini?',
      scope: BurningQuestionScope.REGION,
      is_active: true,
    },
    {
      text: 'Apakah pemilik/PIC pernah menerima keluhan kualitas produk TACO dalam 1 bulan terakhir? Jika ya, sebutkan produknya.',
      scope: BurningQuestionScope.STORE,
      is_active: true,
    },
  ]);

  await bqRepo.save(bqs);
  console.log(`  Burning questions done: ${bqs.length}`);

  // ── 9. POSM Assets ─────────────────────────────────────────────────────────
  console.log('Seeding POSM assets...');
  const posmRepo = ds.getRepository(PosmAsset);

  const posms = posmRepo.create([
    { name: 'Standing Banner', category: 'Banner', is_required: true, is_active: true },
    { name: 'Shelf Strip', category: 'Shelf', is_required: true, is_active: true },
    { name: 'Price Tag Holder', category: 'Pricing', is_required: true, is_active: true },
    { name: 'Poster A2', category: 'Poster', is_required: false, is_active: true },
    { name: 'Product Tester Display', category: 'Display', is_required: false, is_active: true },
  ]);

  await posmRepo.save(posms);
  console.log(`  POSM assets done: ${posms.length}`);

  // ── 10. Visit Objectives ───────────────────────────────────────────────────
  console.log('Seeding visit objectives...');
  const voRepo = ds.getRepository(VisitObjective);

  const objectives = voRepo.create([
    {
      name: 'Kunjungan Rutin',
      description: 'Kunjungan terjadwal rutin untuk memantau kondisi toko, stok, dan display produk TACO.',
      is_active: true,
    },
    {
      name: 'Follow-up Stok',
      description: 'Tindak lanjut ketersediaan stok produk TACO yang hampir habis atau kosong.',
      is_active: true,
    },
    {
      name: 'Pengenalan Produk Baru',
      description: 'Presentasi dan sosialisasi produk TACO terbaru kepada pemilik atau PIC toko.',
      is_active: true,
    },
  ]);

  await voRepo.save(objectives);
  console.log(`  Visit objectives done: ${objectives.length}`);

  // ── 11. Visit Contexts ─────────────────────────────────────────────────────
  console.log('Seeding visit contexts...');
  const vcRepo = ds.getRepository(VisitContext);

  const contexts = vcRepo.create([
    { name: 'Distributor Langsung', is_active: true },
    { name: 'Sub-distributor', is_active: true },
    { name: 'Modern Trade', is_active: true },
    { name: 'Traditional Trade', is_active: true },
  ]);

  await vcRepo.save(contexts);
  console.log(`  Visit contexts done: ${contexts.length}`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\nSeed complete.');
  console.log('Summary:');
  console.log('  Territories  : 5');
  console.log('  Users        : 3  (admin / manager / rep — password: password123)');
  console.log('  Stores       : 15');
  console.log(`  TACO SKUs    : ${tacoSkus.length}`);
  console.log(`  Comp. Brands : ${brands.length}`);
  console.log(`  Comp. SKUs   : ${competitorSkus.length}`);
  console.log(`  Burning Qs   : ${bqs.length}`);
  console.log(`  POSM Assets  : ${posms.length}`);
  console.log(`  Visit Obj.   : ${objectives.length}`);
  console.log(`  Visit Ctx.   : ${contexts.length}`);

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
