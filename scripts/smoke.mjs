/**
 * End-to-end smoke test in a real browser: renders the example model with the
 * OpenSCAD WASM build, measures two points, changes a parameter, and checks the
 * error path. Requires a running preview server and a Chromium build:
 *
 *   npx playwright install chromium
 *   npm run build && npm run preview &
 *   npm run smoke
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const URL = process.env.SCADPAD_URL ?? 'http://127.0.0.1:4173/';
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 880 } });

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text());
});

console.log(`scadpad smoke test: ${URL}`);

await page.goto(URL, { waitUntil: 'load' });

const statusText = () => page.locator('#status').innerText();
const waitForStatus = (pattern) =>
  page.waitForFunction(
    (source) => new RegExp(source).test(document.getElementById('status').textContent),
    pattern,
    { timeout: 120_000 },
  );

// --- first render -----------------------------------------------------------
await waitForStatus('Wyrenderowano');
check('model renders on load', true);

const stats = await page.locator('#stats').innerText();
check('stats show dimensions in mm', /mm/.test(stats), stats.replace(/\n/g, ' | '));
check('stats are not empty', !stats.includes('—'), stats.replace(/\n/g, ' | '));
check('export button is enabled', await page.locator('#export-btn').isEnabled());
check('no page errors', pageErrors.length === 0, pageErrors.join('; '));

// --- measurement ------------------------------------------------------------
await page.locator('#measure-btn').click();
check('hint appears in measure mode', /Kliknij dwa punkty/.test(await page.locator('#hint').innerText()));

const canvas = page.locator('#viewport canvas');
const box = await canvas.boundingBox();
const clickAt = (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

await clickAt(0.45, 0.46);
await clickAt(0.56, 0.54);

const measureVisible = await page.locator('#measure-box').isVisible();
check('measurement box opens after two clicks', measureVisible);

if (measureVisible) {
  const text = await page.locator('#measure-box').innerText();
  check('measurement reports ΔX/ΔY/ΔZ', /ΔX/.test(text) && /ΔY/.test(text) && /ΔZ/.test(text), text.replace(/\n/g, ' | '));
  check('measurement reports a distance', /Odległość:/.test(text));
}

// --- screenshot for the README ---------------------------------------------
// Taken with the measurement box open: it is the feature that makes scadpad
// different from the pile of OpenSCAD playgrounds.
await mkdir('docs', { recursive: true });
await page.screenshot({ path: 'docs/screenshot.png' });
check('screenshot saved', true);
await page.locator('#measure-btn').click(); // leave measure mode

// --- parameter change -------------------------------------------------------
const before = await page.locator('#stats').innerText();

await page.evaluate(() => {
  const slider = document.querySelector('#params input[type="range"]');
  slider.value = slider.max;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});

await waitForStatus('Renderuję');
await waitForStatus('Wyrenderowano');

const after = await page.locator('#stats').innerText();
check('changing a slider re-renders the model', before !== after, `${before.replace(/\n/g, ' ')} → ${after.replace(/\n/g, ' ')}`);

// --- error path -------------------------------------------------------------
await page.evaluate(() => {
  window.scadpad.setSource('cube([');
  window.scadpad.render();
});
await page.waitForFunction(
  () => document.getElementById('status').classList.contains('error'),
  null,
  { timeout: 60_000 },
);
check('syntax error is reported in the status bar', true);
check('export keeps the last good STL', await page.locator('#export-btn').isEnabled());

// --- result -----------------------------------------------------------------
await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\nall checks passed');
