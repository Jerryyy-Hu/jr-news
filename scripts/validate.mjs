import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = (await readdir(path.join(root, 'data'))).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
assert(files.length > 0, 'At least one edition is required.');
const timelineStages = new Set(['background', 'proposal', 'announcement', 'scheduled', 'effective', 'outcome', 'watch']);
const articleLinks = new Set();
const references = [];
const isText = value => typeof value === 'string' && value.trim().length > 0;

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateSource(source) {
  assert.equal(new URL(source.url).protocol, 'https:');
  assert(isText(source.name));
  assert(['full_text', 'search_excerpt'].includes(source.verification));
}

function validateTimeline(steps, editionDate, id) {
  assert(Array.isArray(steps) && steps.length, `${id}: timeline requires steps`);
  let lastDate = '';
  for (const [index, step] of steps.entries()) {
    assert(timelineStages.has(step.stage) && isText(step.text), `${id}: invalid timeline step`);
    if (step.stage === 'watch') {
      assert(step.date === undefined && index === steps.length - 1, `${id}: keep the undated watch step last`);
    } else {
      assert(isDate(step.date) && step.date >= lastDate, `${id}: timeline dates must be chronological`);
      assert(step.stage === 'scheduled' ? step.date > editionDate : step.date <= editionDate, `${id}: only scheduled milestones may be after the edition date`);
      lastDate = step.date;
    }
    validateSource(step.source);
    if (step.article !== undefined) references.push({from: id, ref: step.article});
  }
}

function validateWeeklyReview(review, editionDate) {
  assert(isDate(review.periodStart) && isDate(review.periodEnd), `${editionDate}: invalid review dates`);
  assert(review.periodStart <= review.periodEnd && review.periodEnd <= editionDate, `${editionDate}: invalid review period`);
  for (const key of ['title', 'expected', 'observed', 'unresolved']) {
    assert(isText(review[key]), `${editionDate}: weekly review ${key} required`);
  }
  assert(Array.isArray(review.articles), `${editionDate}: review articles must be an array`);
  for (const ref of review.articles) references.push({from: editionDate, ref});
  assert(Array.isArray(review.sources) && review.sources.length, `${editionDate}: review sources required`);
  review.sources.forEach(validateSource);
}

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
  if (edition.featuredArticleIds !== undefined) {
    const ids = edition.featuredArticleIds;
    assert(Array.isArray(ids) && ids.length <= 3, `${name}: expected at most three featured article IDs`);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate featured article ID`);
    assert(ids.every(id => edition.items.some(item => item.id === id)), `${name}: featured article must belong to this edition`);
  }
  if (edition.weeklyReview !== undefined) validateWeeklyReview(edition.weeklyReview, edition.date);
  for (const item of edition.items) {
    assert(!globalIds.has(item.id), `Duplicate archive item id: ${item.id}`);
    globalIds.add(item.id);
    articleLinks.add(`${edition.date}/${item.id}`);
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
    item.sources.forEach(validateSource);
    if (item.timeline !== undefined) validateTimeline(item.timeline, edition.date, item.id);
    total += 1;
  }
}
for (const {from, ref} of references) {
  assert(ref && articleLinks.has(`${ref.date}/${ref.id}`), `${from}: missing referenced article ${ref?.date}/${ref?.id}`);
}
const manifest = JSON.parse(await readFile(path.join(root, 'data/index.json'), 'utf8'));
assert.deepEqual(manifest.dates, files.map(name => name.slice(0, -5)).reverse());
assert.equal(manifest.latestDate, manifest.dates[0]);
assert.equal(manifest.timezone, 'Asia/Shanghai');
console.log(`Validated ${files.length} editions and ${total} learning articles.`);
