import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  distanceKm,
  powerOf,
  readStation,
  readStations,
  matches,
  connectorsText,
  addressText,
  isFast,
} from '../src/stations.js';
import { readReferenceData, licenseName, groupOf, typesOf, STATUSES } from '../src/reference.js';
import {
  NEARBY,
  FOLLOWED,
  REFERENCE,
  HOUSE,
  rawStation,
  BELLE_ETOILE,
} from './helpers/fixtures.js';

const reference = readReferenceData(REFERENCE);

test('distances: great circle, in km', () => {
  assert.equal(distanceKm(49.6116, 6.1319, 49.6116, 6.1319), 0);
  // Paris - Lyon, about 392 km as the crow flies.
  assert.ok(Math.abs(distanceKm(48.8566, 2.3522, 45.764, 4.8357) - 392) < 2);
});

test('power: PowerKW, or volts x amps, three-phase included', () => {
  assert.equal(powerOf({ PowerKW: 22 }), 22);
  assert.equal(powerOf({ Amps: 32, Voltage: 230, CurrentTypeID: 10 }), 7.4);
  assert.equal(powerOf({ Amps: 32, Voltage: 400, CurrentTypeID: 20 }), 22.2);
  assert.equal(powerOf({ Amps: 16, Voltage: 230, CurrentTypeID: 20 }), 11);
  assert.equal(powerOf({}), null);
  assert.equal(powerOf({ PowerKW: 0 }), null);
});

test('a real station: names from the reference data, status, connectors, attribution', () => {
  const station = readStation(rawStation(194234), reference);
  assert.equal(station.name, 'Rue Richard Coudenhove-Kalergi');
  assert.equal(station.status, 'operational');
  assert.equal(station.connector, 0);
  assert.equal(station.maxPowerKw, 350);
  assert.equal(isFast(station), true);
  assert.equal(station.operator, 'Chargy (LU)');
  assert.deepEqual(station.provider, {
    id: 1,
    title: 'Open Charge Map Contributors',
    license: 'CC BY 4.0',
  });
  assert.equal(connectorsText(station), '1 × CCS2 350 kW, 3 × CCS2 160 kW');
  assert.equal(station.url, 'https://openchargemap.org/poi/details/194234');
  assert.match(addressText(station), /Luxembourg$/);
});

test('check-ins: newest first, kind and outcome', () => {
  const station = readStation(
    FOLLOWED.find((raw) => raw.ID === BELLE_ETOILE),
    reference,
  );
  assert.deepEqual(
    station.checkins.map((checkin) => [checkin.kind, checkin.outcome]),
    [
      ['charged', 'success'],
      ['charged', 'success'],
      ['not_visited', 'other'],
      ['other_good', 'success'],
    ],
  );
  assert.equal(station.checkins[0].user, 'Sbrimmers');
  const fault = readStation(
    rawStation(BELLE_ETOILE, {
      UserComments: [{ ID: 5, CommentTypeID: 1000, Comment: 'Broken', DateCreated: '2026-11-01' }],
    }),
  );
  assert.deepEqual(
    [fault.checkins[0].kind, fault.checkins[0].outcome],
    ['fault_report', 'failure'],
  );
});

test('status: the station one, else the one of its connections', () => {
  const base = rawStation(194234);
  const withConnections = (statuses) =>
    readStation({
      ...base,
      StatusTypeID: 0,
      Connections: statuses.map((id, i) => ({ ID: i, ConnectionTypeID: 25, StatusTypeID: id })),
    }).status;
  assert.equal(withConnections([50, 50]), 'operational');
  assert.equal(withConnections([50, 100]), 'partly_operational');
  assert.equal(withConnections([100, 100]), 'not_operational');
  assert.equal(withConnections([]), 'unknown');
  assert.equal(readStation({ ...base, StatusTypeID: 200 }).hidden, true);
  for (const status of Object.values(STATUSES)) {
    assert.ok(status.connector === null || (status.connector >= 0 && status.connector <= 4));
  }
});

test('stations without a position or an id are left out; sorted by distance', () => {
  assert.equal(readStation({ ID: 1, AddressInfo: {} }), null);
  assert.equal(readStation({ AddressInfo: { Latitude: 1, Longitude: 1 } }), null);
  const stations = readStations(NEARBY, HOUSE, reference);
  assert.equal(stations.length, 29);
  assert.ok(stations.every((s, i) => i === 0 || stations[i - 1].distanceKm <= s.distanceKm));
});

test('filters: power, connector groups, public only, hidden', () => {
  const stations = readStations(NEARBY, HOUSE, reference);
  const count = (filters) => stations.filter((station) => matches(station, filters)).length;
  assert.equal(count({}), 29);
  assert.equal(count({ publicOnly: true }), 23);
  assert.equal(count({ minPowerKw: 50 }), 2);
  assert.equal(count({ groups: ['ccs'] }), 3);
  assert.equal(count({ groups: ['chademo'] }), 1);
  assert.equal(count({ groups: ['ccs'], minPowerKw: 300 }), 1);
  assert.equal(count({ groups: ['tesla'] }), 1);
});

test('reference data: connector groups and licences', () => {
  assert.equal(groupOf(1036), 'type2');
  assert.equal(groupOf(27), 'tesla');
  assert.equal(groupOf(31), 'other');
  assert.deepEqual(typesOf(['ccs', 'nope']), [33, 32]);
  assert.equal(licenseName('CC-0'), 'CC0');
  assert.equal(
    licenseName('Provided by Bundesnetzagentur.de under the CC-BY 4.0 license'),
    'CC BY 4.0',
  );
  assert.equal(licenseName(null), '');
  assert.equal(reference.operators.size, 8);
});
