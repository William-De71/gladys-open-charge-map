import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffZone, diffStation, changeOf, SCENE_TRIGGERS, MAX_EVENTS } from '../src/tracker.js';
import { NOW, DAY } from './helpers/fixtures.js';

const station = (id, changes = {}) => ({
  id,
  status: 'operational',
  operational: true,
  createdAt: NOW - 3 * DAY,
  checkins: [],
  ...changes,
});
const zone = (stations, search = 's') => ({ search, stations });

test('zones: the first reading and another search are baselines', () => {
  assert.deepEqual(diffZone(null, zone([station(1)]), NOW), []);
  assert.deepEqual(diffZone(zone([]), zone([station(1)], 'other'), NOW), []);
});

test('zones: a new station recently listed, not an old one coming into view', () => {
  const events = diffZone(
    zone([station(1)]),
    zone([
      station(1),
      station(2),
      station(3, { createdAt: NOW - 400 * DAY }),
      station(4, { createdAt: null }),
    ]),
    NOW,
  );
  assert.deepEqual(
    events.map((event) => [event.key, event.station.id]),
    [[SCENE_TRIGGERS.NEW_STATION, 2]],
  );
  const many = Array.from({ length: 9 }, (_, i) => station(10 + i));
  assert.equal(diffZone(zone([]), zone(many), NOW).length, MAX_EVENTS);
});

test('status changes: out of service, back, other', () => {
  const up = station(1);
  const down = station(1, { status: 'not_operational', operational: false });
  const planned = station(1, { status: 'planned', operational: false });
  const unknown = station(1, { status: 'unknown', operational: null });
  assert.equal(changeOf(up, down), 'unavailable');
  assert.equal(changeOf(down, up), 'available');
  assert.equal(changeOf(unknown, up), 'available');
  assert.equal(changeOf(down, planned), 'other');
  const [event] = diffStation({ station: up }, { station: down }, NOW);
  assert.deepEqual(
    [event.key, event.previous, event.change],
    [SCENE_TRIGGERS.STATION_STATUS_CHANGED, 'operational', 'unavailable'],
  );
  assert.deepEqual(diffStation(null, { station: down }, NOW), [], 'baseline');
  assert.deepEqual(diffStation({ station: up }, { station: up }, NOW), []);
});

test('check-ins: the new ones, oldest first; not the late ones', () => {
  const checkin = (id, daysAgo) => ({ id, at: NOW - daysAgo * DAY });
  const before = station(1, { checkins: [checkin(10, 30)] });
  const after = station(1, {
    checkins: [checkin(13, 0.5), checkin(12, 1), checkin(11, 40), checkin(10, 30)],
  });
  const events = diffStation({ station: before }, { station: after }, NOW);
  assert.deepEqual(
    events.map((event) => [event.key, event.checkin.id]),
    [
      [SCENE_TRIGGERS.NEW_CHECKIN, 12],
      [SCENE_TRIGGERS.NEW_CHECKIN, 13],
    ],
  );
  const first = diffStation({ station: station(1) }, { station: after }, NOW);
  assert.equal(first.length, 2, 'no check-in before: the recent ones are new');
});
