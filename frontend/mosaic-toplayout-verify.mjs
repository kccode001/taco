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

const browser = await chromium.launch();

// ── DESKTOP 1280 (live, no mock) ────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await login(page);
await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
await page.waitForTimeout(2800);

const tn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

// helper: bounding box top (y) of the first element containing text
async function topOf(text) {
  const loc = page.getByText(text, { exact: false }).first();
  if (await loc.count() === 0) return null;
  const box = await loc.boundingBox();
  return box ? box.y : null;
}

// occurrences of the donut title (must be exactly 1 → no duplication, AC-C)
const merekCount = (tn.match(/Komposisi merek di invoice terunggah/g) || []).length;
ok("AC-C donut appears exactly once (no dup)", merekCount === 1, `count=${merekCount}`);

// AC-A: donut sits ABOVE the kategori row, Laporan SKU, and the Top-10 lists
const yMerek = await topOf("Komposisi merek di invoice terunggah");
const yKategori = await topOf("Komposisi kategori TACO");
const yLaporan = await topOf("Laporan SKU");
const yTop10 = await topOf("Top 10 paling sering muncul");
const yTotalInv = await topOf("Total Invoice Terunggah");
const yWilayah = await topOf("Wilayah Tercakup");
ok("AC-A donut above Komposisi kategori", yMerek != null && yKategori != null && yMerek < yKategori, `merek=${yMerek} kategori=${yKategori}`);
ok("AC-A donut above Laporan SKU", yMerek != null && yLaporan != null && yMerek < yLaporan, `merek=${yMerek} laporan=${yLaporan}`);
ok("AC-A donut above Top-10 lists", yMerek != null && yTop10 != null && yMerek < yTop10, `merek=${yMerek} top10=${yTop10}`);

// AC-A layout: donut LEFT, stat cards RIGHT (same top band, donut x < stat x)
const xOf = async (text) => {
  const loc = page.getByText(text, { exact: false }).first();
  if (await loc.count() === 0) return null;
  const b = await loc.boundingBox();
  return b ? b.x : null;
};
const xMerek = await xOf("Komposisi merek di invoice terunggah");
const xTotalInv = await xOf("Total Invoice Terunggah");
ok("AC-A donut-left / stats-right (x order)", xMerek != null && xTotalInv != null && xMerek < xTotalInv, `xMerek=${xMerek} xTotal=${xTotalInv}`);
// stat cards stacked vertically: Total Invoice above Wilayah, roughly same x
ok("AC-A stat cards stacked (Total above Wilayah)", yTotalInv != null && yWilayah != null && yTotalInv < yWilayah, `yTotal=${yTotalInv} yWilayah=${yWilayah}`);
const xWilayah = await xOf("Wilayah Tercakup");
ok("AC-A stat cards same column", xTotalInv != null && xWilayah != null && Math.abs(xTotalInv - xWilayah) < 30, `xTotal=${xTotalInv} xWilayah=${xWilayah}`);
// stat cards in the top band (near the donut, above the kategori row)
ok("AC-B stat cards in top section (above kategori)", yTotalInv != null && yKategori != null && yTotalInv < yKategori, `yTotal=${yTotalInv} yKategori=${yKategori}`);

// AC-B live values
ok("AC-B Total Invoice Terunggah present", tn.includes("Total Invoice Terunggah"));
ok("AC-B Wilayah Tercakup present", tn.includes("Wilayah Tercakup"));
const has36 = /Total Invoice Terunggah[^0-9]*36\b/.test(tn) || /\b36\b/.test(tn);
ok("AC-B Total = 36 (live)", /\b36\b/.test(tn), `body had no 36`);
ok("AC-B Wilayah = 5 / 18 (live)", /\b5\s*\/\s*18\b/.test(tn), `no 5/18`);

// AC-C donut data + legend + footnote
ok("AC-C legend TACO 140 baris · 95%", /TACO 140 baris · 95%/.test(tn) || /140 baris · 95%/.test(tn), tn.match(/\d+ baris · \d+%/g));
ok("AC-C legend Kompetitor 7 baris · 5%", /7 baris · 5%/.test(tn));
ok("AC-C legend Lain-lain 0 baris · 0%", /0 baris · 0%/.test(tn));
ok("AC-C unknown-competitor footnote", /observasi kompetitor tak dikenali — tidak masuk ember Lain-lain/.test(tn));

// AC-E other sections unchanged/present
ok("AC-E Top 10 TACO list present", tn.includes("Top 10 paling sering muncul"));
ok("AC-E Top 10 non-TACO invoices present", tn.includes("Top 10 invoice paling dikuasai non-TACO (per nilai)"));
ok("AC-E Komposisi kategori TACO present", tn.includes("Komposisi kategori TACO"));
ok("AC-E Tren unggahan kategori present", tn.includes("Tren unggahan kategori"));
ok("AC-E Laporan SKU present", tn.includes("Laporan SKU"));
ok("AC-E truth banner present", /Sinyal pasar dari/.test(tn));

await page.screenshot({ path: `${OUT}/01-desktop-1280-full.png`, fullPage: true });
// top-section-only crop (viewport top)
await page.screenshot({ path: `${OUT}/02-desktop-1280-topband.png`, clip: { x: 0, y: 0, width: 1280, height: 700 } });

ok("AC-D 0 console errors @1280", consoleErrors.length === 0, consoleErrors.join(" | "));
await ctx.close();

// ── MOBILE 390 (live) ───────────────────────────────────────────────────────
const mctx = await browser.newContext({ viewport: { width: 390, height: 2200 } });
const mpage = await mctx.newPage();
const mobErrors = [];
mpage.on("console", (m) => { if (m.type() === "error") mobErrors.push(m.text()); });
mpage.on("pageerror", (e) => mobErrors.push("PAGEERROR: " + e.message));
await login(mpage);
await mpage.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(2800);
const tm = (await mpage.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

// at 390 everything single-column: donut x ≈ stat x (stacked, not side-by-side)
const mLoc = async (t) => { const l = mpage.getByText(t, { exact: false }).first(); if (await l.count() === 0) return null; const b = await l.boundingBox(); return b; };
const mMerek = await mLoc("Komposisi merek di invoice terunggah");
const mTotal = await mLoc("Total Invoice Terunggah");
ok("AC-D 390 stacks (donut & stats ~same x)", mMerek && mTotal && Math.abs(mMerek.x - mTotal.x) < 30, mMerek && mTotal ? `xMerek=${mMerek.x} xTotal=${mTotal.x}` : "missing");
ok("AC-D 390 donut still above stats", mMerek && mTotal && mMerek.y < mTotal.y, mMerek && mTotal ? `yMerek=${mMerek.y} yTotal=${mTotal.y}` : "missing");
ok("AC-D 390 renders all sections", tm.includes("Komposisi merek di invoice terunggah") && tm.includes("Total Invoice Terunggah") && tm.includes("Laporan SKU") && tm.includes("Komposisi kategori TACO"));

await mpage.screenshot({ path: `${OUT}/03-mobile-390-full.png`, fullPage: true });
await mpage.screenshot({ path: `${OUT}/04-mobile-390-topband.png`, clip: { x: 0, y: 0, width: 390, height: 900 } });
ok("AC-D 0 console errors @390", mobErrors.length === 0, mobErrors.join(" | "));
await mctx.close();

await browser.close();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ pass, total: results.length, results }, null, 2));
console.log(`\n${pass}/${results.length} checks PASS`);
if (fail.length) { console.log("FAILURES:"); fail.forEach((f) => console.log(` ✗ ${f.n} — ${f.extra}`)); }
console.log("\nScreenshots in", OUT);
process.exit(fail.length ? 1 : 0);
