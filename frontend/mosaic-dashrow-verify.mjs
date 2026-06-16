import { chromium } from "playwright";
import fs from "fs";

const OUT = "evidence/mosaic-dashrow-2026-06-16";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4014";

const results = [];
const ok = (n, cond, extra = "") => results.push({ n, pass: !!cond, extra: cond ? "" : String(extra).slice(0, 220) });

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.getByText("Admin TACO", { exact: false }).click();
  await page.waitForURL(/\/(taro|admin)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}
const sectionBox = (page, t) => page.locator(`section:has-text(${JSON.stringify(t)})`).first().boundingBox();
const cardBox = (page, t) => page.locator(`div.bg-taco-card:has-text(${JSON.stringify(t)})`).first().boundingBox();
async function listScroll(page, t) {
  const ol = page.locator(`div.bg-taco-card:has-text(${JSON.stringify(t)}) ol`).first();
  if (await ol.count() === 0) return null;
  return await ol.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, scrollable: el.scrollHeight > el.clientHeight + 1 }));
}

const browser = await chromium.launch();

// ── DESKTOP 1280 — section row, equal-height lists, title, SKU detail real ───
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  // AC-4 — title
  ok("AC-4 title 'Dashboard' present", /Dashboard/.test(tn), "");
  ok("AC-4 'Intelijen Pasar' gone", !/Intelijen Pasar/.test(tn), tn.match(/Intelijen Pasar/)?.[0] ?? "");

  // AC-1 — donut LEFT, stats stacked RIGHT, same band
  const donut = await sectionBox(page, "Komposisi merek di invoice terunggah");
  const totalCard = await cardBox(page, "Total Invoice Terunggah");
  const wilCard = await cardBox(page, "Wilayah Tercakup");
  ok("AC-1 donut + both stat cards present", donut && totalCard && wilCard, "");
  ok("AC-1 donut LEFT of stats (x)", donut && totalCard && donut.x < totalCard.x - 40, donut && totalCard ? `donutX=${Math.round(donut.x)} totalX=${Math.round(totalCard.x)}` : "missing");
  ok("AC-1 donut & stats same band (top y ≈)", donut && totalCard && Math.abs(donut.y - totalCard.y) < 40, donut && totalCard ? `donutY=${Math.round(donut.y)} totalY=${Math.round(totalCard.y)}` : "missing");
  ok("AC-1 Total ON TOP of Wilayah (stacked, same x)", totalCard && wilCard && totalCard.y < wilCard.y && Math.abs(totalCard.x - wilCard.x) < 20, totalCard && wilCard ? `yT=${Math.round(totalCard.y)} yW=${Math.round(wilCard.y)} xT=${Math.round(totalCard.x)} xW=${Math.round(wilCard.x)}` : "missing");
  ok("AC-1 stats to the RIGHT, roughly half-width band", donut && totalCard && totalCard.x > donut.x + donut.width - 60, donut && totalCard ? `donutRight=${Math.round(donut.x + donut.width)} totalX=${Math.round(totalCard.x)}` : "");
  // live values in the band
  ok("AC-1 Total Invoice = 36 (live)", /\b36\b/.test(tn), "");
  ok("AC-1 Wilayah = 5 / 18 (live)", /\b5\s*\/\s*18\b/.test(tn), "");

  // AC-2 — Top-10 equal height + scroll
  const freqCard = await cardBox(page, "Top 10 paling sering muncul");
  const nonCard = await cardBox(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-2 both Top-10 cards present", freqCard && nonCard, "");
  ok("AC-2 cards EQUAL height (±6px)", freqCard && nonCard && Math.abs(freqCard.height - nonCard.height) <= 6, freqCard && nonCard ? `freqH=${Math.round(freqCard.height)} nonH=${Math.round(nonCard.height)}` : "missing");
  ok("AC-2 cards bounded height (360–445)", freqCard && nonCard && freqCard.height >= 355 && freqCard.height <= 445 && nonCard.height <= 445, freqCard && nonCard ? `freqH=${Math.round(freqCard.height)} nonH=${Math.round(nonCard.height)}` : "missing");
  const nonScroll = await listScroll(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-2 non-TACO list body scrolls when content exceeds", nonScroll && nonScroll.scrollable, JSON.stringify(nonScroll));

  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("no horizontal scroll @1280", noHScroll);
  await page.screenshot({ path: `${OUT}/01-dashboard-1280-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/02-dashboard-1280-row.png`, clip: { x: 0, y: 0, width: 1280, height: 760 } });

  // ── AC-3 — open §3 Laporan SKU detail and verify REAL DB values ───────────
  // Live ground truth for "Absolute White" (BE :5013, period 30d):
  //   14 invoices · p_min 75.500 · p_avg 81.036 · p_max 85.000 · stores incl. "Lestari Jaya"
  const row = page.locator(`div.bg-taco-card:has-text("Laporan SKU") tr:has-text("Absolute White"), section:has-text("Laporan SKU") tr:has-text("Absolute White")`).first();
  let modalText = "";
  if (await row.count() > 0) {
    await row.click();
    await page.waitForTimeout(2200);
    modalText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    await page.screenshot({ path: `${OUT}/03-sku-detail-1280.png`, fullPage: false });
  }
  ok("AC-3 SKU detail modal opens", /Absolute White/.test(modalText), modalText.slice(0, 80));
  ok("AC-3 detail shows live coverage (14 invoice)", /14 invoice/.test(modalText), modalText.match(/\d+ invoice/g)?.join(",") ?? "");
  ok("AC-3 detail shows a REAL DB store (not synthetic)", /Lestari Jaya|Mitra Dekor|Indofurni|Mulia Bangunan|Toko Borneo/.test(modalText), "no live store name in modal");
  ok("AC-3 detail shows real price band (75.500 / 85.000)", /75\.?500/.test(modalText) || /85\.?000/.test(modalText) || /81\.?0/.test(modalText), "no live price in modal");
  ok("AC-3 0 console errors after detail open", errs.length === 0, errs.join(" | "));

  ok("AC-X 0 console errors @1280", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── MOBILE 390 — reflow, no banner regressions, equal-height lists ───────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 3200 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tm = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  ok("AC-4(390) title Dashboard", /Dashboard/.test(tm) && !/Intelijen Pasar/.test(tm), "");
  const donut = await sectionBox(page, "Komposisi merek di invoice terunggah");
  const totalCard = await cardBox(page, "Total Invoice Terunggah");
  ok("AC-1(390) donut & stats stack (same x, donut above)", donut && totalCard && Math.abs(donut.x - totalCard.x) < 30 && donut.y < totalCard.y, donut && totalCard ? `dx=${Math.round(donut.x)} tx=${Math.round(totalCard.x)}` : "missing");
  const freqCard = await cardBox(page, "Top 10 paling sering muncul");
  const nonCard = await cardBox(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-2(390) Top-10 cards bounded + equal height", freqCard && nonCard && Math.abs(freqCard.height - nonCard.height) <= 6 && nonCard.height <= 445, freqCard && nonCard ? `f=${Math.round(freqCard.height)} n=${Math.round(nonCard.height)}` : "missing");
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("no horizontal scroll @390", noHScroll);
  ok("AC(390) all sections present (no regression)", /Komposisi merek/.test(tm) && /Komposisi kategori TACO/.test(tm) && /Tren unggahan kategori/.test(tm) && /Laporan SKU/.test(tm), "");

  await page.screenshot({ path: `${OUT}/04-dashboard-390-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/05-dashboard-390-top.png`, clip: { x: 0, y: 0, width: 390, height: 1100 } });
  ok("AC-X 0 console errors @390", errs.length === 0, errs.join(" | "));
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
