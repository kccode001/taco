import { chromium } from "playwright";
import fs from "fs";

const OUT = "evidence/mosaic-topfull-2026-06-16";
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

const sectionBox = (page, text) => page.locator(`section:has-text(${JSON.stringify(text)})`).first().boundingBox();
const cardBox = (page, text) => page.locator(`div.bg-taco-card:has-text(${JSON.stringify(text)})`).first().boundingBox();

// returns {scroll, client} for the <ol> inside the card whose header contains `text`
async function listScroll(page, text) {
  const ol = page.locator(`div.bg-taco-card:has-text(${JSON.stringify(text)}) ol`).first();
  if (await ol.count() === 0) return null;
  return await ol.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, rows: el.children.length }));
}

const browser = await chromium.launch();

// ── DESKTOP 1280 — full-width donut, 2-up KPIs, full-height lists, no banner ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2200 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  // AC-4 — truth banner removed
  ok("AC-4 'Sinyal pasar dari…' banner removed", !/Sinyal pasar dari/.test(tn) && !/bukan total penjualan TACO/.test(tn), tn.match(/Sinyal pasar[^.]*/)?.[0] ?? "");

  // AC-1 — Komposisi merek spans full width (donut section ≫ a half-column KPI card)
  const donut = await sectionBox(page, "Komposisi merek di invoice terunggah");
  const totalCard = await cardBox(page, "Total Invoice Terunggah");
  const freqCard = await cardBox(page, "Top 10 paling sering muncul");
  ok("AC-1 donut panel present", !!donut, "");
  ok("AC-1 donut panel is full-width (> 700px @1280)", donut && donut.width > 700, donut ? `w=${Math.round(donut.width)}` : "missing");
  ok("AC-1 donut wider than a Top-10 half-column (≥1.7×)", donut && freqCard && donut.width >= freqCard.width * 1.7, donut && freqCard ? `donut=${Math.round(donut.width)} freq=${Math.round(freqCard.width)}` : "missing");

  // KPI row 2-up: Total left, Wilayah right (same band, different x), BELOW the donut
  const wilCard = await cardBox(page, "Wilayah Tercakup");
  ok("KPI Total & Wilayah side-by-side (2-up)", totalCard && wilCard && Math.abs(totalCard.y - wilCard.y) < 30 && wilCard.x > totalCard.x + 50, totalCard && wilCard ? `yT=${Math.round(totalCard.y)} yW=${Math.round(wilCard.y)} xT=${Math.round(totalCard.x)} xW=${Math.round(wilCard.x)}` : "missing");
  ok("KPI row below the full-width donut", donut && totalCard && totalCard.y > donut.y + 40, donut && totalCard ? `donutY=${Math.round(donut.y)} kpiY=${Math.round(totalCard.y)}` : "missing");

  // AC-2 / AC-3 — lists render full height: their <ol> is NOT an inner scroll container
  const freqScroll = await listScroll(page, "Top 10 paling sering muncul");
  const nonScroll = await listScroll(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-2 Top-10 freq list not inner-scrolled (full height)", freqScroll && freqScroll.scroll <= freqScroll.client + 1, JSON.stringify(freqScroll));
  ok("AC-2 Top-10 freq shows its rows", freqScroll && freqScroll.rows >= 1, JSON.stringify(freqScroll));
  ok("AC-3 Top-10 non-TACO list not inner-scrolled (full height)", nonScroll && nonScroll.scroll <= nonScroll.client + 1, JSON.stringify(nonScroll));
  ok("AC-3 Top-10 non-TACO shows its rows", nonScroll && nonScroll.rows >= 1, JSON.stringify(nonScroll));

  // live data sanity (no mock): live seed = 36 inv / 27 toko / 5 wilayah; mock = 42/24/4
  ok("live data (not mock): 27 toko · 5 wilayah present", /27 toko/.test(tn) && /5 wilayah/.test(tn), "");
  ok("live data (not mock): mock signature 24 toko/4 wilayah ABSENT", !/24 toko · 4 wilayah/.test(tn), "");

  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("no horizontal scroll @1280", noHScroll);

  await page.screenshot({ path: `${OUT}/01-analytics-1280-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/02-analytics-1280-top.png`, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  ok("AC-D 0 console errors @1280", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── DESKTOP 1280 — AC-5: /taro/v2/dashboard serves REAL DB data ──────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2200 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  const resp = await page.goto(`${BASE}/taro/v2/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const td = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  ok("AC-5 /taro/v2/dashboard HTTP 200", resp && resp.status() === 200, resp ? String(resp.status()) : "no resp");
  ok("AC-5 dashboard renders the analytics surface", /Komposisi merek di invoice terunggah/.test(td) && /Total Invoice Terunggah/.test(td), "");
  // real DB numbers — live seed 36/27/5, donut TACO 140·95%; mock would be 42/24/4
  ok("AC-5 real data: Total Invoice = 36 (live, not mock 42)", /\b36\b/.test(td) && !/\b42 invoice\b/.test(td), "");
  ok("AC-5 real data: coverage 27 toko · 5 wilayah", /27 toko/.test(td) && /5 wilayah/.test(td), "");
  ok("AC-5 real data: donut TACO 140 baris · 95%", /140 baris · 95%/.test(td), "");
  ok("AC-5 no banner on dashboard either", !/Sinyal pasar dari/.test(td), "");

  await page.screenshot({ path: `${OUT}/03-dashboard-1280-real.png`, fullPage: true });
  ok("AC-5 0 console errors on /dashboard", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── MOBILE 390 — single column reflow, lists full height, no banner ──────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 3000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await login(page);
  await page.goto(`${BASE}/taro/v2/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const tm = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  ok("AC-4(390) banner removed", !/Sinyal pasar dari/.test(tm), "");
  const donut = await sectionBox(page, "Komposisi merek di invoice terunggah");
  const totalCardM = await cardBox(page, "Total Invoice Terunggah");
  // full-width = donut spans the same content column as the KPI cards (shell sidebar is fixed; content is narrow at 390, pre-existing)
  ok("AC-1(390) donut spans full content column (≈ KPI card width)", donut && totalCardM && donut.width >= totalCardM.width * 0.9, donut && totalCardM ? `donut=${Math.round(donut.width)} card=${Math.round(totalCardM.width)}` : "missing");
  const freqScroll = await listScroll(page, "Top 10 paling sering muncul");
  const nonScroll = await listScroll(page, "Top 10 invoice paling dikuasai non-TACO");
  ok("AC-2(390) freq list full height (no inner scroll)", freqScroll && freqScroll.scroll <= freqScroll.client + 1, JSON.stringify(freqScroll));
  ok("AC-3(390) non-TACO list full height (no inner scroll)", nonScroll && nonScroll.scroll <= nonScroll.client + 1, JSON.stringify(nonScroll));
  // KPI cards stack at 390 (Total above Wilayah, same x)
  const totalCard = await cardBox(page, "Total Invoice Terunggah");
  const wilCard = await cardBox(page, "Wilayah Tercakup");
  ok("AC(390) KPI cards stack (single column)", totalCard && wilCard && Math.abs(totalCard.x - wilCard.x) < 30 && wilCard.y > totalCard.y, totalCard && wilCard ? `xT=${Math.round(totalCard.x)} xW=${Math.round(wilCard.x)}` : "missing");
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  ok("no horizontal scroll @390", noHScroll);

  await page.screenshot({ path: `${OUT}/04-analytics-390-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/05-analytics-390-top.png`, clip: { x: 0, y: 0, width: 390, height: 1200 } });
  ok("AC-D 0 console errors @390", errs.length === 0, errs.join(" | "));
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
