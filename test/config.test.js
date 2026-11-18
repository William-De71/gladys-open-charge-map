import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  readCoordinates,
  readGroups,
  readLanguage,
  DEFAULT_INTERVAL,
  DEFAULT_RADIUS,
  DEFAULT_OFFERED,
} from '../src/config.js';

test('defaults: no key, no place, 5 km, public only, every 6 hours', () => {
  const config = normalizeConfig();
  assert.equal(config.apiKey, null);
  assert.deepEqual(config.places, []);
  assert.deepEqual(config.filters, {
    radiusKm: DEFAULT_RADIUS,
    minPowerKw: 0,
    groups: [],
    publicOnly: true,
  });
  assert.equal(config.offered, DEFAULT_OFFERED);
  assert.equal(config.interval, DEFAULT_INTERVAL);
  assert.equal(config.language, 'auto');
});

test('places: a house or a typed position per slot, the position wins', () => {
  const config = normalizeConfig({
    api_key: ' key ',
    house_1: 'maison',
    house_2: 'bureau',
    coordinates_2: '48.85, 2.35',
    coordinates_3: 'nowhere',
  });
  assert.equal(config.apiKey, 'key');
  assert.deepEqual(
    config.places.map(({ slot, house, coordinates }) => [slot, house, coordinates]),
    [
      [1, 'maison', null],
      [2, 'bureau', { latitude: 48.85, longitude: 2.35 }],
      [3, null, null],
    ],
  );
});

test('typed positions: the forms map apps copy', () => {
  const position = { latitude: 46.3069, longitude: 4.8325 };
  assert.deepEqual(readCoordinates('46.3069, 4.8325'), position);
  assert.deepEqual(readCoordinates('46.3069,4.8325'), position);
  assert.deepEqual(readCoordinates('46.3069 4.8325'), position);
  assert.deepEqual(readCoordinates('46,3069; 4,8325'), position);
  assert.deepEqual(readCoordinates('46.3069°, 4.8325°'), position);
  assert.deepEqual(readCoordinates('-33.8688, 151.2093'), {
    latitude: -33.8688,
    longitude: 151.2093,
  });
  for (const wrong of ['', 'Mâcon', '95, 4', '46.3', '0, 0', '1, 2, 3']) {
    assert.equal(readCoordinates(wrong), null, wrong);
  }
});

test('search values outside the lists fall back to the defaults', () => {
  const config = normalizeConfig({
    radius: '7',
    min_power: '50',
    interval: '2',
    offered: '20',
    public_only: 'false',
    language: 'fr',
  });
  assert.equal(config.filters.radiusKm, DEFAULT_RADIUS);
  assert.equal(config.filters.minPowerKw, 50);
  assert.equal(config.filters.publicOnly, false);
  assert.equal(config.interval, DEFAULT_INTERVAL);
  assert.equal(config.offered, 20);
  assert.equal(config.language, 'fr');
});

test('connector groups: an array, JSON or a list; unknown ones dropped, in a fixed order', () => {
  assert.deepEqual(readGroups(['ccs', 'type2', 'nope']), ['type2', 'ccs']);
  assert.deepEqual(readGroups('["chademo"]'), ['chademo']);
  assert.deepEqual(readGroups('ccs, tesla'), ['ccs', 'tesla']);
  assert.deepEqual(readGroups(undefined), []);
});

test('the stored language of the last request', () => {
  assert.equal(readLanguage({ last_language: 'de' }, 'en'), 'de');
  assert.equal(readLanguage({ last_language: 'xx-YY' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
