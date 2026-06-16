import { chromium } from "playwright";
import fs from "fs";

const OUT = "evidence/mosaic-toplayout-2026-06-16";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4014";

const results = [];
const ok = (n, cond, extra = "") => results.push({ n, pass: !!cond, extra: cond ? "" : String(extra).slice(0, 200) });

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.getByText("Admin TACO", { exact: false }).click();
  await page.waitForURL(/\/(taro|admin)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

// boxOf: bounding box of first element containing text (null if absent)
async function boxOf(page, text) {
  const loc = page.getByText(text, { exact: false }).first();
  if (await loc.count() === 0) return null;
  return await loc.boundingBox();
}

const browser = await chromium.launch();

// ── DESKTOP 1536 — WIDE: 4 panels in a SINGLE ROW (KC 1-row revision) ────────
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1600 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  const bMerek = await boxOf(page, "Komposisi merek di invoice terunggah");
  const bTotal = await boxOf(page, "Total Invoice Terunggah");
  const bFreq = await boxOf(page, "Top 10 paling sering muncul");
  const bNon = await boxOf(page, "Top 10 invoice paling dikuasai non-TACO");
  const bKategori = await boxOf(page, "Komposisi kategori TACO");
  const all4 = [bMerek, bTotal, bFreq, bNon];
  const present = all4.every((b) => b);
  ok("AC-A(1536) all 4 top panels present", present, JSON.stringify(all4.map((b) => (b ? Math.round(b.x) : null))));
  // single row: all 4 headings share one horizontal band (top y within tolerance)
  if (present) {
    const ys = all4.map((b) => b.y);
    const yBand = Math.max(...ys) - Math.min(...ys);
    ok("AC-A(1536) 4 panels in ONE horizontal row (y-band ≤ 80px)", yBand <= 80, `yBand=${Math.round(yBand)} ys=${ys.map(Math.round)}`);
    // x strictly increasing left→right: donut < stats < top10-freq < top10-nonTACO
    const xs = all4.map((b) => b.x);
    const incr = xs[0] < xs[1] && xs[1] < xs[2] && xs[2] < xs[3];
    ok("AC-A(1536) panel order donut<stats<freq<nonTACO (x)", incr, `xs=${xs.map(Math.round)}`);
    // the row sits ABOVE the kategori section (top band is genuinely the top)
    ok("AC-A(1536) top row above Komposisi kategori", bKategori && Math.max(...ys) < bKategori.y, `rowMaxY=${Math.round(Math.max(...ys))} kategoriY=${bKategori ? Math.round(bKategori.y) : null}`);
  }
  // AC-C live donut data unchanged
  ok("AC-C(1536) donut appears exactly once", (tn.match(/Komposisi merek di invoice terunggah/g) || []).length === 1);
  ok("AC-C(1536) legend TACO 140 baris · 95%", /140 baris · 95%/.test(tn));
  ok("AC-C(1536) legend Kompetitor 7 baris · 5%", /7 baris · 5%/.test(tn));
  ok("AC-C(1536) unknown-competitor footnote", /observasi kompetitor tak dikenali/.test(tn));
  ok("AC-B(1536) Total = 36 (live)", /\b36\b/.test(tn));
  ok("AC-B(1536) Wilayah = 5 / 18 (live)", /\b5\s*\/\s*18\b/.test(tn));

  await page.screenshot({ path: `${OUT}/01-desktop-1536-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/02-desktop-1536-row.png`, clip: { x: 0, y: 0, width: 1536, height: 640 } });
  ok("AC-D(1536) 0 console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── DESKTOP 1280 — graceful 2-up (4-across would squish the non-TACO bars) ───
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  const bMerek = await boxOf(page, "Komposisi merek di invoice terunggah");
  const bTotal = await boxOf(page, "Total Invoice Terunggah");
  const bWil = await boxOf(page, "Wilayah Tercakup");
  const bFreq = await boxOf(page, "Top 10 paling sering muncul");
  const bKategori = await boxOf(page, "Komposisi kategori TACO");
  // 2-up: donut left, stats right, same band; top-10s wrap to the row below
  ok("AC-D(1280) donut-left / stats-right", bMerek && bTotal && bMerek.x < bTotal.x, bMerek && bTotal ? `xMerek=${Math.round(bMerek.x)} xTotal=${Math.round(bTotal.x)}` : "missing");
  ok("AC-D(1280) donut & stats same band (2-up)", bMerek && bTotal && Math.abs(bMerek.y - bTotal.y) <= 80, bMerek && bTotal ? `yMerek=${Math.round(bMerek.y)} yTotal=${Math.round(bTotal.y)}` : "missing");
  ok("AC-A(1280) stat cards stacked (Total above Wilayah)", bTotal && bWil && bTotal.y < bWil.y && Math.abs(bTotal.x - bWil.x) < 30, bTotal && bWil ? `yT=${Math.round(bTotal.y)} yW=${Math.round(bWil.y)}` : "missing");
  ok("AC-D(1280) Top-10s wrap below the top band", bMerek && bFreq && bFreq.y > bMerek.y, bMerek && bFreq ? `yMerek=${Math.round(bMerek.y)} yFreq=${Math.round(bFreq.y)}` : "missing");
  ok("AC-A(1280) top section above kategori", bMerek && bKategori && bMerek.y < bKategori.y, "");
  // no horizontal scroll (no overflow)
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("AC-D(1280) no horizontal scroll", noHScroll);
  // AC-C/E content intact
  ok("AC-C(1280) donut once + live 95%", (tn.match(/Komposisi merek di invoice terunggah/g) || []).length === 1 && /140 baris · 95%/.test(tn));
  ok("AC-E(1280) all sections present", tn.includes("Total Invoice Terunggah") && tn.includes("Top 10 paling sering muncul") && tn.includes("Top 10 invoice paling dikuasai non-TACO (per nilai)") && tn.includes("Komposisi kategori TACO") && tn.includes("Tren unggahan kategori") && tn.includes("Laporan SKU") && /Sinyal pasar dari/.test(tn));

  await page.screenshot({ path: `${OUT}/03-desktop-1280-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/04-desktop-1280-2up.png`, clip: { x: 0, y: 0, width: 1280, height: 760 } });
  ok("AC-D(1280) 0 console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── MOBILE 390 — single column, donut above stats, clean reflow ──────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 2400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tm = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  const bMerek = await boxOf(page, "Komposisi merek di invoice terunggah");
  const bTotal = await boxOf(page, "Total Invoice Terunggah");
  const bNon = await boxOf(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-D(390) single column (donut & stats ~same x)", bMerek && bTotal && Math.abs(bMerek.x - bTotal.x) < 30, bMerek && bTotal ? `xMerek=${Math.round(bMerek.x)} xTotal=${Math.round(bTotal.x)}` : "missing");
  ok("AC-D(390) donut above stats", bMerek && bTotal && bMerek.y < bTotal.y, "");
  ok("AC-D(390) all 4 panels stacked same column", bMerek && bNon && Math.abs(bMerek.x - bNon.x) < 30, bMerek && bNon ? `xMerek=${Math.round(bMerek.x)} xNon=${Math.round(bNon.x)}` : "missing");
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("AC-D(390) no horizontal scroll", noHScroll);
  ok("AC-D(390) renders all sections", tm.includes("Komposisi merek di invoice terunggah") && tm.includes("Total Invoice Terunggah") && tm.includes("Laporan SKU") && tm.includes("Komposisi kategori TACO"));

  await page.screenshot({ path: `${OUT}/05-mobile-390-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/06-mobile-390-topband.png`, clip: { x: 0, y: 0, width: 390, height: 1100 } });
  ok("AC-D(390) 0 console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

await browser.close();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ pass, total: results.length, results }, null, 2));
console.log(`\n${pass}/${results.length} checks PASS`);
if (fail.length) { console.log("FAILURES:"); fail.forEach((f) => console.log(` ✗ ${f.n} — ${f.extra}`)); }
console.log("\nScreenshots in", OUT);
process.exit(fail.length ? 1 : 0);
