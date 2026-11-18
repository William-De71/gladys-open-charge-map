import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildZoneEvent,
  buildStationEvent,
  buildFindOutputs,
  readFindFields,
} from '../src/events.js';
import { SCENE_TRIGGERS } from '../src/tracker.js';
import { readStations, readStation, readCheckin } from '../src/stations.js';
import { readReferenceData } from '../src/reference.js';
import {
  fakeGladys,
  NEARBY,
  FOLLOWED,
  REFERENCE,
  HOUSE,
  NOW,
  BELLE_ETOILE,
  rawCheckin,
} from './helpers/fixtures.js';

const reference = readReferenceData(REFERENCE);
const PLACE = {
  id: 'house-maison',
  slot: 1,
  label: 'Maison',
  latitude: HOUSE.latitude,
  longitude: HOUSE.longitude,
};
const stations = readStations(NEARBY, PLACE, reference);
const zone = { place: PLACE, radiusKm: 10, stations, fetchedAt: NOW };
const manifest = JSON.parse(
  (await import('node:fs')).readFileSync(
    new URL('../gladys-assistant-integration.json', import.meta.url),
    'utf8',
  ),
);
const declared = (key) =>
  new Set(
    manifest.scene_triggers.find((trigger) => trigger.key === key).variables.map((v) => v.key),
  );

/**
 * @description Check the limits of an event payload and its declared variables.
 * @param {{ key: string, data: object }} event - The event.
 */
function checkPayload({ key, data }) {
  const keys = Object.keys(data);
  assert.ok(keys.length <= 30, `${key}: ${keys.length} keys`);
  for (const [name, value] of Object.entries(data)) {
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      `${key}.${name} is a scalar`,
    );
    if (typeof value === 'string') {
      assert.ok(value.length <= 1000, `${key}.${name}`);
    }
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${key}.${name}`);
    }
  }
  const variables = declared(key);
  for (const name of keys.filter((k) => !['device', 'fast', 'change', 'outcome'].includes(k))) {
    assert.ok(variables.has(name), `${key}.${name} is declared`);
  }
}

test('new_station: the values of the station, flat and declared', () => {
  const event = buildZoneEvent(
    fakeGladys,
    zone,
    { key: SCENE_TRIGGERS.NEW_STATION, station: stations.find((s) => s.id === 194234) },
    'fr',
  );
  checkPayload(event);
  assert.equal(event.data.device, 'ext:open-charge-map:zone:house-maison');
  assert.equal(event.data.fast, 'yes');
  assert.equal(event.data.distance_km, 2.65);
  assert.equal(event.data.operator, 'Chargy (LU)');
  assert.equal(
    event.data.summary,
    'Nouvelle borne de recharge près de Maison : Rue Richard Coudenhove-Kalergi (Luxembourg), 2,6 km, 350 kW.',
  );
});

test('station events: status change and check-in', () => {
  const station = readStation(
    FOLLOWED.find((raw) => raw.ID === BELLE_ETOILE),
    reference,
  );
  const snapshot = { station: { ...station, status: 'not_operational', operational: false } };
  const status = buildStationEvent(
    fakeGladys,
    snapshot,
    { key: SCENE_TRIGGERS.STATION_STATUS_CHANGED, previous: 'operational', change: 'unavailable' },
    'de',
  );
  checkPayload(status);
  assert.equal(
    status.data.summary,
    'shopping center La Belle Etoile (Bertrange): Außer Betrieb (vorher: In Betrieb).',
  );
  const checkin = buildStationEvent(
    fakeGladys,
    { station },
    { key: SCENE_TRIGGERS.NEW_CHECKIN, checkin: readCheckin(rawCheckin()) },
    'en',
  );
  checkPayload(checkin);
  assert.equal(checkin.data.outcome, 'failure');
  assert.equal(checkin.data.rating, null);
  assert.match(
    checkin.data.summary,
    /Failed: equipment problem, 17\/11\/2026 \(Ana\) “Card reader broken”$/,
  );
  assert.throws(() => buildStationEvent(fakeGladys, { station }, { key: 'nope' }, 'en'));
});

test('find_station: fields, outputs typed and declared', () => {
  assert.deepEqual(readFindFields({}), { groups: [], minPowerKw: 0, inServiceOnly: true });
  assert.deepEqual(readFindFields({ connector: 'ccs', min_power: '50', in_service_only: false }), {
    groups: ['ccs'],
    minPowerKw: 50,
    inServiceOnly: false,
  });
  const outputs = buildFindOutputs(zone, { connector: 'chademo' }, 'en');
  assert.equal(outputs.station_id, 22950);
  const declaredOutputs = manifest.scene_actions[0].outputs;
  assert.deepEqual(Object.keys(outputs).sort(), declaredOutputs.map((o) => o.key).sort());
  for (const { key, type } of declaredOutputs) {
    assert.equal(typeof outputs[key], type, key);
  }
  const none = buildFindOutputs(zone, { min_power: 1000 }, 'es');
  for (const { key, type } of declaredOutputs) {
    assert.equal(typeof none[key], type, `none.${key}`);
  }
  assert.equal(none.summary, 'Ningún punto que coincida a menos de 10 km de Maison.');
});
