import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  targetOf,
  placeId,
  placeLabel,
  stationName,
  zoneSummary,
  checkinText,
  buildZoneDevice,
  buildStationDevice,
  buildZoneStates,
  buildStationStates,
} from '../src/device.js';
import { readStations, readStation, matches } from '../src/stations.js';
import { readReferenceData } from '../src/reference.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  fakeGladys,
  NEARBY,
  FOLLOWED,
  REFERENCE,
  HOUSE,
  NOW,
  BELLE_ETOILE,
} from './helpers/fixtures.js';

const reference = readReferenceData(REFERENCE);
const PLACE = {
  id: 'house-maison',
  slot: 1,
  label: 'Maison',
  latitude: HOUSE.latitude,
  longitude: HOUSE.longitude,
};
const zone = (stations = readStations(NEARBY, PLACE, reference)) => ({
  place: PLACE,
  search: 's',
  radiusKm: 5,
  capped: false,
  fetchedAt: NOW,
  stations: stations.filter(
    (station) => station.distanceKm <= 5 && matches(station, { publicOnly: true }),
  ),
});
const states = (list) =>
  Object.fromEntries(
    list.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.state ?? state.text,
    ]),
  );

test('ids: the house selector, the typed position, the station id', () => {
  assert.equal(placeId({ house: 'maison' }), 'house-maison');
  assert.equal(placeId({ house: 'Maison de Campagne!' }), 'house-maison-de-campagne');
  assert.equal(
    placeId({ house: 'maison', coordinates: { latitude: 46.30694, longitude: -4.8325 } }),
    'pos-46-3069-m4-8325',
  );
  assert.deepEqual(targetOf('ext:open-charge-map:station:32022:status'), {
    type: 'station',
    id: '32022',
  });
  assert.deepEqual(targetOf('ext:open-charge-map:zone:pos-46-3069-m4-8325'), {
    type: 'zone',
    id: 'pos-46-3069-m4-8325',
  });
  assert.equal(targetOf(undefined), null);
  assert.equal(placeLabel({ typed: true, slot: 2, label: 'Place 2' }, 'es'), 'Lugar 2');
});

test('a zone device and a station device, in every language', () => {
  const station = readStation(
    FOLLOWED.find((raw) => raw.ID === BELLE_ETOILE),
    reference,
  );
  for (const language of LANGUAGES) {
    const zoneDevice = buildZoneDevice(fakeGladys, PLACE, language);
    assert.equal(zoneDevice.external_id, 'ext:open-charge-map:zone:house-maison');
    assert.equal(zoneDevice.should_poll, false);
    assert.equal(zoneDevice.features.length, 4);
    const stationDevice = buildStationDevice(fakeGladys, station, language);
    assert.equal(stationDevice.external_id, 'ext:open-charge-map:station:32022');
    assert.equal(stationDevice.features.length, 4);
    assert.ok([...zoneDevice.features, ...stationDevice.features].every((f) => f.read_only));
  }
  assert.equal(buildZoneDevice(fakeGladys, PLACE, 'fr').name, 'Bornes de recharge · Maison');
  assert.equal(stationName(station), 'shopping center La Belle Etoile (Bertrange)');
});

test('zone states: in service, fast, nearest, summary', () => {
  assert.deepEqual(states(buildZoneStates(fakeGladys, zone(), 'fr')), {
    stations: 20,
    fast: 2,
    nearest: 0.74,
    summary:
      '20 bornes en service à moins de 5 km, dont 2 rapides (50 kW+). La plus proche : Rue de la Tour Jacob (Luxemburg), 0,7 km.',
  });
  const empty = states(buildZoneStates(fakeGladys, zone([]), 'en'));
  assert.equal(empty.nearest, undefined, 'no nearest station: no state');
  assert.equal(empty.summary, 'No station in service within 5 km matching the search.');
  assert.match(zoneSummary({ ...zone(), capped: true }, 'de'), /^20\+ Ladestationen/);
});

test('station states: connector status, points, details, last check-in', () => {
  const station = readStation(
    FOLLOWED.find((raw) => raw.ID === BELLE_ETOILE),
    reference,
  );
  assert.deepEqual(states(buildStationStates(fakeGladys, { station, fetchedAt: NOW }, 'es')), {
    status: 0,
    points: 1,
    details:
      'En servicio · 11 kW máx. · 2 × Type 2 11 kW · Público, suscripción necesaria · 0.00 jaarabonnement',
    checkin:
      'Recarga correcta, 03/09/2019 (Sbrimmers) «Require now regestration, I used my chargy card.»',
  });
  const unknown = { ...station, connector: null, checkins: [] };
  const list = states(buildStationStates(fakeGladys, { station: unknown, fetchedAt: NOW }, 'en'));
  assert.equal(list.status, undefined, 'an unknown status is not published');
  assert.equal(list.checkin, 'No check-in yet.');
  assert.equal(
    checkinText({ kind: null, at: NaN, comment: null, user: null }, 'de'),
    'Kommentar, ?',
  );
});
