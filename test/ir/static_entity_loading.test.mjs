import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { dummyEntities, notifyDevices } from '../../src/data/entities_index.js';
import { dummyEntities as ha } from '../../src/data/entities_homeassistant.js';
import { dummyEntities as corpus, notifyDevices as corpusNotify } from '../../src/data/entities_geekofweek.js';
import { dummyEntities as fixtures } from '../../src/data/entities_static.js';
import { getDomainEntityOptionsWithPlaceholder, getNotifyTargetOptions, getPersonOptions, getZoneOptions } from '../../src/data/options.js';
import { getBlockSearchResults } from '../../src/block_search_flyout.js';

test('bundled catalog loads with network access forbidden and exposes every saved entity once', () => {
  const url = new URL('../../src/data/entities_index.js', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = () => { throw new Error('Entity startup must be offline'); };
    const { dummyEntities } = await import(${JSON.stringify(url)});
    if (!dummyEntities.length) throw new Error('Empty bundled catalog');
  `], { stdio: 'pipe' });
  const ids = dummyEntities.map((entity) => entity.entity_id);
  assert.equal(ids.length, new Set(ids).size);
  for (const entity of [...corpus, ...fixtures, ...ha]) assert.ok(ids.includes(entity.entity_id));
});

test('HA snapshot metadata wins over corpus and test-fixture duplicates', () => {
  const corpusIds = new Set(corpus.map((entity) => entity.entity_id));
  assert.ok(ha.some((entity) => corpusIds.has(entity.entity_id)), 'exercise an actual duplicate');
  for (const entity of ha) {
    assert.strictEqual(dummyEntities.find((item) => item.entity_id === entity.entity_id), entity);
  }
  for (const entity of fixtures.filter((item) => !ha.some((saved) => saved.entity_id === item.entity_id))) {
    assert.strictEqual(dummyEntities.find((item) => item.entity_id === entity.entity_id), entity);
  }
});

test('saved catalog populates dropdowns and Entity names are searchable without study filtering', () => {
  for (const entity of dummyEntities) {
    const ids = getDomainEntityOptionsWithPlaceholder(entity.entity_id.split('.')[0]).map(([, id]) => id);
    assert.ok(ids.includes(entity.entity_id), entity.entity_id);
  }
  for (const [domain, options] of [['person', getPersonOptions()], ['zone', getZoneOptions()]]) {
    const expected = dummyEntities.filter((entity) => entity.entity_id.startsWith(`${domain}.`));
    assert.deepEqual(options.filter(([, id]) => id).map(([, id]) => id), expected.map((entity) => entity.entity_id));
  }
  const light = dummyEntities.find((entity) => entity.entity_id.startsWith('light.'));
  assert.ok(getBlockSearchResults(light.entity_id).some((result) => result.type === 'action_light'));
});

test('notification options retain saved entities and legacy service targets', () => {
  const ids = getNotifyTargetOptions().map(([, id]) => id);
  assert.ok(ids.includes('notify'));
  assert.ok(ids.includes('persistent_notification'));
  for (const target of corpusNotify) assert.ok(notifyDevices.includes(target));
  for (const entity of dummyEntities.filter((item) => item.entity_id.startsWith('notify.'))) {
    assert.ok(ids.includes(entity.entity_id));
  }
  assert.equal(ids.length, new Set(ids).size);
});
