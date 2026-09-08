import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer, launchOptions, trackPageFailures } from './static-server.mjs';

const server = process.env.ZELDA2MARIO_BASE_URL ? null : await startStaticServer();
const url = process.env.ZELDA2MARIO_BASE_URL || `${server.origin}/zelda2mario/`;
const output = process.env.ZELDA2MARIO_SCREENSHOT_DIR || await mkdtemp(join(tmpdir(), 'zelda2mario-smoke-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions());
const results = [];
const statuses = ['All', 'Complete', 'In Progress', 'Blocked', 'Not Started'];
const phaseNames = ['authority', 'Z22', 'Mario mapping', 'runtime contract', 'Integration', 'movement', 'Combat', 'Transitions', 'Rendering', 'Release verification', 'Package'];
const m2Names = ['ownership', 'shared-tail', 'timing', 'NMI/mapper', 'ABI', 'soak'];

async function assertReadable(page, selectors) {
  const failures = await page.evaluate(selectors => {
    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
    const lum = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const failures = [];
    for (const selector of selectors) for (const node of document.querySelectorAll(selector)) {
      if (!node.getClientRects().length) continue;
      let parent = node;
      let background;
      while (parent) {
        const color = rgb(getComputedStyle(parent).backgroundColor);
        if (color.length === 3 || color[3] === 1) { background = color; break; }
        parent = parent.parentElement;
      }
      if (!background) background = [255, 255, 255];
      const foreground = rgb(getComputedStyle(node).color);
      const [high, low] = [lum(foreground), lum(background)].sort((a, b) => b - a);
      const ratio = (high + .05) / (low + .05);
      if (ratio < 4.5) failures.push({ selector, text: node.textContent.slice(0, 50), ratio });
    }
    return failures;
  }, selectors);
  assert.deepEqual(failures, [], 'normal text meets 4.5:1 contrast in the tested theme/media');
}

try {
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 1000], [2560, 720]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const failures = trackPageFailures(page, new URL(url).origin);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'default is light even when OS prefers dark');
    const source = await page.content();
    assert.doesNotMatch(source, /\/Users\/|\/Volumes\/|app\.notion\.com|notion\.so|github\.com\/DaveHomeAssist\/Zelda2MarioCoop/i, 'public projection excludes private paths and source links');
    assert.equal(await page.locator('script[src]').count(), 0, 'dashboard has no external script dependency');
    assert.equal(await page.locator('#status-data').count(), 1);
    const data = JSON.parse(await page.locator('#status-data').textContent());
    assert.equal(data.phases.length, 11);
    assert.equal(data.m2.length, 6);
    assert.match(data.meta.sourceCommit, /^[a-f0-9]{40}$/);
    assert.match(data.meta.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    data.phases.forEach((item, i) => { assert.equal(item.id, `phase-${i}`); assert.ok(item.name.includes(phaseNames[i])); });
    data.m2.forEach((item, i) => { assert.equal(item.id, `m2-${i + 1}`); assert.ok(item.name.includes(m2Names[i])); });
    const items = [...data.milestones, ...data.phases, ...data.m2];
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    for (const item of items) {
      assert.ok(statuses.slice(1).includes(item.status));
      assert.ok(item.verification && item.dependency && item.notes);
      for (const field of ['completedAt', 'plannedAt']) {
        assert.ok(item[field] === null || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/.test(item[field]), `${item.id}: dates are dates, never dependency prose`);
      }
    }
    assert.equal(await page.locator('[data-work-id]').count(), items.length);
    assert.deepEqual(await page.locator('#metrics strong').allTextContents(), ['11', '6', String(data.gates.find(g => g.id === 'inputs').value), String(data.gates.find(g => g.id === 'tests').value)]);
    const dates = await page.locator('#events time').evaluateAll(nodes => nodes.map(node => node.dateTime));
    assert.deepEqual(dates, [...dates].sort(), 'timeline is chronological');
    assert.equal(dates.length, data.milestones.length);
    assert.ok(await page.locator('[data-event-id="pr10"]').textContent().then(text => text.includes('Merged')));

    const overview = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, top: r.top, bottom: r.bottom }; };
      return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, title: rect('h1'), signal: rect('.signal'), tabs: rect('.tabbar'), columns: getComputedStyle(document.querySelector('.overview-grid')).gridTemplateColumns.split(' ').length, panelOverflow: getComputedStyle(document.querySelector('#overview')).overflowY };
    });
    assert.equal(overview.width, width);
    assert.ok(overview.documentWidth <= width, 'document does not overflow');
    assert.ok(overview.documentHeight <= height + 1, 'dashboard shell fits viewport');
    for (const key of ['title', 'signal', 'tabs']) assert.ok(overview[key].x >= 0 && overview[key].right <= width, `${width}: ${key} content fits, not merely hidden`);
    assert.equal(overview.panelOverflow, 'auto');
    if (width <= 600) assert.ok(overview.tabs.bottom >= height - 1 && overview.tabs.top > height / 2, 'mobile bottom navigation');
    if (width >= 1900) assert.equal(overview.columns, 3, 'ultrawide adds a meaningful third overview column');
    await assertReadable(page, ['.intro', '.kicker', '.chip', '.gate p', '.next-list span', '.tabbar button']);
    await page.screenshot({ path: join(output, `${width}-overview-light.png`) });

    await page.locator('#theme-toggle').click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), 'true');
    await assertReadable(page, ['.intro', '.kicker', '.chip', '.gate p', '.next-list span', '.tabbar button']);
    await page.screenshot({ path: join(output, `${width}-overview-dark.png`) });

    await page.locator('#tab-overview').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'tab-timeline');
    assert.equal(await page.locator('#timeline').isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'tab-evidence');
    await page.keyboard.press('Home');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'tab-overview');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'tab-evidence');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    assert.ok(await page.locator(':focus').evaluate(node => getComputedStyle(node).outlineStyle === 'solid'));

    await page.locator('#tab-work').click();
    const fieldIssues = await page.locator('.work-row td').evaluateAll(cells => cells.flatMap(cell => {
      const r = cell.getBoundingClientRect();
      return r.x < 0 || r.right > innerWidth || cell.scrollWidth > cell.clientWidth + 1 || !cell.dataset.label || !cell.textContent.trim() ? [cell.textContent.slice(0, 60)] : [];
    }));
    assert.deepEqual(fieldIssues, [], `${width}: all dates, notes and dependencies remain accessible`);
    await page.screenshot({ path: join(output, `${width}-work.png`) });
    for (const status of statuses) {
      await page.locator('#status-filter').selectOption(status);
      const expected = items.filter(item => status === 'All' || item.status === status).length;
      assert.equal(await page.locator('.work-row:visible').count(), expected);
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 4, 'print includes every tab');
      assert.equal(await page.locator('.work-row:visible').count(), items.length, 'print restores every filtered row');
      await assertReadable(page, ['td', 'td strong', 'td small', '.chip', '.kicker', '.intro', '.evidence-grid code']);
      await page.emulateMedia({ media: 'screen' });
      assert.equal(await page.locator('.work-row:visible').count(), expected, 'printing preserves screen filter state');
    }
    await page.locator('#status-filter').selectOption('All');
    await page.locator('#work-search').fill('zzzz-no-matching-task');
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.work-row:visible').count(), items.length, 'empty search cannot create an empty printed report');
    if (width === 1440) await page.pdf({ path: join(output, 'complete-report.pdf'), printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.locator('#work-search').fill('');
    await page.locator('#theme-toggle').click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'light choice persists too');
    assert.deepEqual(failures, []);
    results.push({ width, height, workItems: items.length, phases: 11, m2: 6, filters: statuses.length, printAllRows: true, consoleErrors: failures, pass: true });
    await context.close();
  }
  // Storage denial must not prevent theme selection or status rendering.
  const restricted = await browser.newContext();
  await restricted.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } }); });
  const page = await restricted.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const links = await page.locator('a[href^="https:"]').evaluateAll(nodes => [...new Set(nodes.map(node => node.href))]);
  for (const link of links) assert.ok((await page.request.get(link)).ok(), `public navigation works: ${link}`);
  await restricted.close();
  // A future approved target must render as planned, without becoming actual completion.
  const scheduled = await browser.newContext();
  const scheduledPage = await scheduled.newPage();
  await scheduledPage.route(url, async route => {
    const response = await route.fetch();
    const html = await response.text();
    const body = html.replace(/(<script id="status-data" type="application\/json">)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
      const data = JSON.parse(json);
      data.phases[1].plannedAt = '2026-12-31';
      return start + JSON.stringify(data) + end;
    });
    await route.fulfill({ response, body });
  });
  await scheduledPage.goto(url, { waitUntil: 'networkidle' });
  await scheduledPage.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const plannedCell = scheduledPage.locator('[data-work-id="phase-1"] td').nth(3);
  assert.match(await plannedCell.textContent(), /2026-12-31 \(date\)Planned · committed target/);
  assert.doesNotMatch(await plannedCell.textContent(), /Actual/);
  await scheduled.close();
  await writeFile(join(output, 'report.json'), `${JSON.stringify({ url, results, pass: true }, null, 2)}\n`);
  console.log(JSON.stringify({ pass: true, viewports: results.length, workItems: results[0].workItems, output }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
