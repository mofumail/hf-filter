const test = require('node:test');
const assert = require('node:assert/strict');
const HFX = require('../src/lib.js');

test('parseSize understands suffixes, exponents and separators', () => {
  assert.equal(HFX.parseSize('8B'), 8e9);
  assert.equal(HFX.parseSize('500m'), 5e8);
  assert.equal(HFX.parseSize('2.5b'), 2.5e9);
  assert.equal(HFX.parseSize('10k'), 1e4);
  assert.equal(HFX.parseSize('1T'), 1e12);
  assert.equal(HFX.parseSize('1.5e9'), 1.5e9);
  assert.equal(HFX.parseSize('1,000,000'), 1e6);
  assert.equal(HFX.parseSize(' 7 B '), 7e9);
  assert.equal(HFX.parseSize('0'), 0);
  assert.equal(HFX.parseSize('.5B'), 5e8);
});

test('parseSize separates empty from invalid', () => {
  assert.equal(HFX.parseSize(''), null);
  assert.equal(HFX.parseSize('   '), null);
  assert.equal(HFX.parseSize(undefined), null);
  assert.ok(Number.isNaN(HFX.parseSize('big')));
  assert.ok(Number.isNaN(HFX.parseSize('8G')));
  assert.ok(Number.isNaN(HFX.parseSize('-1B')));
  assert.ok(Number.isNaN(HFX.parseSize('1B2')));
});

test('formatSize is compact only when it round-trips', () => {
  assert.equal(HFX.formatSize(8e9), '8B');
  assert.equal(HFX.formatSize(2.5e9), '2.5B');
  assert.equal(HFX.formatSize(3.7e9), '3.7B');
  assert.equal(HFX.formatSize(5e8), '500M');
  assert.equal(HFX.formatSize(1e12), '1T');
  assert.equal(HFX.formatSize(123456789), '123456789');
  assert.equal(HFX.formatSize(1), '1');
  assert.equal(HFX.formatSize(0), '0');
  for (const n of [1, 999, 1000, 1500, 123456789, 27781427952, 1e9, 64e9, 2.25e9]) {
    assert.equal(HFX.parseSize(HFX.formatSize(n)), n);
  }
});

test('readParamRange reads the forms HF and this extension produce', () => {
  assert.deepEqual(HFX.readParamRange('?num_parameters=min:0,max:1B'), { min: 0, max: 1e9 });
  assert.deepEqual(HFX.readParamRange('?num_parameters=min%3A1%2Cmax%3A500M'), { min: 1, max: 5e8 });
  assert.deepEqual(HFX.readParamRange('?num_parameters=max:123456789&sort=likes'), { min: null, max: 123456789 });
  assert.deepEqual(HFX.readParamRange('?num_parameters=min:7B'), { min: 7e9, max: null });
  assert.deepEqual(HFX.readParamRange('?sort=likes'), { min: null, max: null });
  assert.deepEqual(HFX.readParamRange('?num_parameters=min:oops,max:2B'), { min: null, max: 2e9 });
});

test('writeParamRange keeps other filters and resets the page', () => {
  assert.equal(
    HFX.writeParamRange('?pipeline_tag=text-generation&sort=downloads&p=3', { min: 1, max: 8e9 }),
    '?pipeline_tag=text-generation&sort=downloads&num_parameters=min:1,max:8B',
  );
  assert.equal(HFX.writeParamRange('?search=llama+3', { min: null, max: 5e8 }), '?search=llama+3&num_parameters=max:500M');
  assert.equal(HFX.writeParamRange('?num_parameters=min:0,max:1B&sort=likes', { min: null, max: null }), '?sort=likes');
  assert.equal(HFX.writeParamRange('?num_parameters=min:0,max:1B', { min: null, max: null }), '');
  assert.equal(HFX.writeParamRange('', { min: 3e9, max: null }), '?num_parameters=min:3B');
  // A second apply replaces the first instead of stacking.
  assert.equal(HFX.writeParamRange('?num_parameters=min:1,max:8B', { min: 1, max: 4e9 }), '?num_parameters=min:1,max:4B');
});

test('compileFilters reports what is active', () => {
  const idle = HFX.compileFilters({ minDownloads: '', minLikes: '', maxAgeDays: '', hideGated: false, exclude: ' , ' });
  assert.equal(idle.active, false);
  assert.equal(idle.needsData, false);

  const nameOnly = HFX.compileFilters({ exclude: 'GGUF, Abliterated ' });
  assert.deepEqual(nameOnly.exclude, ['gguf', 'abliterated']);
  assert.equal(nameOnly.active, true);
  assert.equal(nameOnly.needsData, false);

  const withData = HFX.compileFilters({ minDownloads: '10k', minLikes: 'nope' });
  assert.equal(withData.minDownloads, 10000);
  assert.equal(withData.minLikes, null);
  assert.equal(withData.needsData, true);
});

test('matches applies each filter', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');
  const model = {
    id: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    downloads: 50000,
    likes: 120,
    gated: false,
    lastModified: '2026-09-28T00:00:00.000Z',
  };
  const check = (raw, target = model) => HFX.matches(target, HFX.compileFilters(raw), now);

  assert.equal(check({}), true);
  assert.equal(check({ minDownloads: '50k' }), true);
  assert.equal(check({ minDownloads: '50001' }), false);
  assert.equal(check({ minLikes: '121' }), false);
  assert.equal(check({ maxAgeDays: '10' }), true);
  assert.equal(check({ maxAgeDays: '9' }), false);
  assert.equal(check({ hideGated: true }), true);
  assert.equal(check({ hideGated: true }, { ...model, gated: 'auto' }), false);
  assert.equal(check({ exclude: 'gguf' }), false);
  assert.equal(check({ exclude: 'unsloth/' }), false);
  assert.equal(check({ exclude: 'mlx, onnx' }), true);
});

test('matches never hides a card it has no data for', () => {
  const filters = HFX.compileFilters({ minDownloads: '1M', minLikes: '1k', maxAgeDays: '1', hideGated: true });
  assert.equal(HFX.matches({ id: 'someone/model' }, filters), true);
});
