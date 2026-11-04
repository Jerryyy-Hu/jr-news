import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = (await readdir(path.join(root, 'data'))).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
assert(files.length > 0, 'At least one edition is required.');
let total = 0;
const globalIds = new Set();
for (const name of files) {
  const text = await readFile(path.join(root, 'data', name), 'utf8');
  assert(!text.includes('\ufffd'), `${name}: invalid replacement character`);
  const edition = JSON.parse(text);
  assert.equal(edition.date + '.json', name);
  assert.equal(edition.windowEnd, edition.date + 'T22:00:00+08:00');
  const start = Date.parse(edition.windowStart);
  const end = Date.parse(edition.windowEnd);
  assert.equal(end - start, 86400000, `${name}: expected a 24-hour window`);
  assert.equal(edition.outlook.split('。').filter(Boolean).length, 1, `${name}: one-sentence outlook`);
  assert(edition.coverageNote?.length > 0);
  assert(Array.isArray(edition.items));
  for (const item of edition.items) {
    assert(!globalIds.has(item.id), `Duplicate archive item id: ${item.id}`);
    globalIds.add(item.id);
    assert(['positive', 'negative', 'neutral'].includes(item.category));
    assert(item.markets.length > 0 && item.markets.every(value => ['A股', '美股'].includes(value)));
    for (const key of ['title', 'summary', 'analysis', 'watch', 'caveat', 'topic', 'timeLabel']) {
      assert(typeof item[key] === 'string' && item[key].length > 0, `${item.id}: ${key} required`);
    }
    assert.equal(item.summary.split('。').filter(Boolean).length, 1, `${item.id}: summary must be one sentence`);
    for (const key of ['term', 'explanation', 'example']) assert(item.knowledge?.[key]?.length > 0);
    const timestamp = item.publishedAt || item.eventAt;
    if (timestamp) {
      const instant = Date.parse(timestamp);
      assert(instant > start && instant <= end, `${item.id}: outside cutoff window`);
    } else {
      assert.equal(item.eventDate, edition.date, `${item.id}: explicit approximate event date required`);
      assert(item.caveat.includes('美东'), `${item.id}: explain source time-zone conversion`);
    }
    assert(item.sources.length > 0, `${item.id}: sources required`);
    for (const source of item.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert(source.name.length > 0);
      assert(['full_text', 'search_excerpt'].includes(source.verification));
    }
    total += 1;
  }
}
const manifest = JSON.parse(await readFile(path.join(root, 'data/index.json'), 'utf8'));
assert.deepEqual(manifest.dates, files.map(name => name.slice(0, -5)).reverse());
assert.equal(manifest.latestDate, manifest.dates[0]);
assert.equal(manifest.timezone, 'Asia/Shanghai');
console.log(`Validated ${files.length} editions and ${total} learning articles.`);
