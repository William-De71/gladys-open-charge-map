// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake of the Open
// Charge Map API answering real stations around Luxembourg City.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import {
  fakeWeb,
  rawStation,
  rawCheckin,
  silent,
  noSleep,
  NOW,
  DAY,
  KEY,
  HOUSE,
  BELLE_ETOILE,
  TOUR_JACOB,
} from './helpers/fixtures.js';

const ZONE = 'ext:test-integration:zone:house-maison';
const STATION = (id) => `ext:test-integration:station:${id}`;
const CONFIG = { api_key: KEY, house_1: 'maison', radius: '10' };

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, web, houses }`.
 * @returns {Promise<object>} `{ gladys, app, fetch, clock }`.
 */
async function startApp({ config = CONFIG, web = {}, houses = [HOUSE] } = {}) {
  const fetch = fakeWeb(web);
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config, houses });
  const app = createApp(gladys, {
    fetchImpl: fetch,
    now: () => clock.now,
    sleep: noSleep,
    createdDebounceMs: 0,
    logger: silent,
  });
  await gladys.connect();
  return { gladys, app, fetch, clock };
}

const poiCalls = (fetch) => fetch.calls.filter((call) => call.path === '/v3/poi');
const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const widget = async (gladys, key, options) =>
  (await gladys.fake.widgetGet(key, options)).data.content;
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
/**
 * @description Wait for a condition the timers fulfil.
 * @param {Function} condition - `() => boolean`.
 * @returns {Promise<void>}
 */
async function until(condition) {
  for (let i = 0; i < 100 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(condition(), 'condition reached');
}

test('a house becomes a zone with its nearest stations, after one request and the reference data', async (t) => {
  const { gladys, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    fetch.calls.map((call) => call.path),
    ['/v3/referencedata', '/v3/poi'],
  );
  const [call] = poiCalls(fetch);
  assert.equal(call.headers['X-API-Key'], KEY);
  assert.match(call.headers['User-Agent'], /^gladys-open-charge-map\/\d+\.\d+\.\d+ \(\+https:/);
  assert.equal(call.query.get('latitude'), '49.61160');
  assert.equal(call.query.get('distance'), '10');
  assert.equal(call.query.get('distanceunit'), 'km');
  assert.equal(call.query.get('compact'), 'true');
  assert.equal(call.query.get('maxresults'), '250');
  const [zone, ...stations] = gladys.fake.discoveredDevices;
  assert.deepEqual([zone.external_id, zone.name], [ZONE, 'Charging stations · Maison']);
  assert.equal(stations.length, 10, 'the 10 nearest, by default');
  assert.equal(stations[0].external_id, STATION(TOUR_JACOB));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /lu pour 1 lieu/);
});

test('without a key: nothing is read and the user is told where to get one', async (t) => {
  const { gladys, fetch } = await startApp({ config: { house_1: 'maison' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /My profile > My apps/);
  const content = await widget(gladys, WIDGETS.NEARBY, { language: 'fr' });
  assert.match(content.components[0].text, /clé d’API Open Charge Map/);
  assert.match(JSON.stringify((await gladys.fake.action(ACTIONS.CHECK)).data), /API key/);
});

test('a refused key is reported as such', async (t) => {
  const { gladys } = await startApp({ config: { ...CONFIG, api_key: 'wrong' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refuse la clé/);
  assert.equal(gladys.fake.discoveredDevices.length, 1, 'the zone only, no station known');
});

test('a created zone publishes its states, then only what changed', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ZONE);
  assert.equal(gladys.fake.lastState(`${ZONE}:stations`), 23);
  assert.equal(gladys.fake.lastState(`${ZONE}:fast`), 2);
  assert.equal(gladys.fake.lastState(`${ZONE}:nearest`), 0.74);
  assert.match(
    gladys.fake.lastState(`${ZONE}:summary`),
    /^23 stations in service within 10 km, 2 fast \(50 kW\+\)\. Nearest: Rue de la Tour Jacob/,
  );
  const sent = gladys.fake.states.length;
  await app.watcher.round();
  assert.equal(gladys.fake.states.length, sent, 'same answer, nothing sent again');

  fetch.state.nearby = fetch.state.nearby.filter((raw) => raw.ID !== TOUR_JACOB);
  await app.watcher.round();
  assert.equal(gladys.fake.lastState(`${ZONE}:stations`), 22);
  assert.equal(gladys.fake.lastState(`${ZONE}:nearest`), 0.86);
});

test('a followed station is read with its check-ins, once for a batch of creations', async (t) => {
  const { gladys, app, fetch } = await startApp({ config: { ...CONFIG, offered: '50' } });
  t.after(() => gladys.fake.shutdown());
  const before = poiCalls(fetch).length;
  await created(gladys, STATION(BELLE_ETOILE));
  await created(gladys, STATION(TOUR_JACOB));
  // Shown at once from what the zone knows, then with the check-ins.
  assert.equal(gladys.fake.lastState(`${STATION(TOUR_JACOB)}:status`), 0);
  await until(() => app.watcher.station(BELLE_ETOILE));
  const calls = poiCalls(fetch).slice(before);
  assert.equal(calls.length, 1, 'one request for the two stations');
  assert.deepEqual(calls[0].query.get('chargepointid').split(',').sort(), ['32022', '84030']);
  assert.equal(calls[0].query.get('includecomments'), 'true');
  assert.equal(gladys.fake.lastState(`${STATION(BELLE_ETOILE)}:points`), 1);
  assert.match(
    gladys.fake.lastState(`${STATION(BELLE_ETOILE)}:checkin`),
    /^Charged successfully, 03\/09\/2019 \(Sbrimmers\)/,
  );
  assert.match(
    gladys.fake.lastState(`${STATION(BELLE_ETOILE)}:details`),
    /^In service · 11 kW max · 2 × Type 2 11 kW · Public, membership required/,
  );
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
});

test('a followed station: a check-in and a status change, one event each', async (t) => {
  const { gladys, app, fetch, clock } = await startApp({ config: { ...CONFIG, offered: '50' } });
  t.after(() => gladys.fake.shutdown());
  await created(gladys, STATION(BELLE_ETOILE));
  await until(() => app.watcher.station(BELLE_ETOILE));

  clock.now = NOW + 6 * 3600000;
  const station = rawStation(BELLE_ETOILE);
  station.UserComments = [rawCheckin(), ...station.UserComments];
  station.StatusTypeID = 100;
  fetch.state.stations[BELLE_ETOILE] = station;
  await app.watcher.round();

  const [status] = eventsOf(gladys, 'station_status_changed');
  assert.equal(status.data.device, STATION(BELLE_ETOILE));
  assert.equal(status.data.change, 'unavailable');
  assert.equal(status.data.previous_status, 'operational');
  assert.equal(status.data.status, 'not_operational');
  assert.match(status.data.summary, /Out of service \(was In service\)/);
  const [checkin] = eventsOf(gladys, 'new_checkin');
  assert.equal(checkin.data.outcome, 'failure');
  assert.equal(checkin.data.kind, 'failed_problem');
  assert.equal(checkin.data.comment, 'Card reader broken');
  assert.equal(checkin.data.checked_at, '2026-11-17T08:00:00.000Z');
  assert.equal(gladys.fake.lastState(`${STATION(BELLE_ETOILE)}:status`), 4);

  await app.watcher.round();
  assert.equal(gladys.fake.sceneEvents.length, 2, 'nothing new, nothing fired');
});

test('a station listed recently appears around a place: new_station; an old one does not', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const fresh = rawStation(TOUR_JACOB, {
    ID: 999001,
    DateCreated: new Date(NOW - 3 * DAY).toISOString(),
    Connections: [{ ID: 1, ConnectionTypeID: 33, StatusTypeID: 50, PowerKW: 150, Quantity: 4 }],
  });
  const old = rawStation(TOUR_JACOB, { ID: 999002, DateCreated: '2016-01-01T00:00:00Z' });
  fetch.state.nearby = [fresh, old, ...fetch.state.nearby];
  await app.watcher.round();
  const events = eventsOf(gladys, 'new_station');
  assert.equal(events.length, 1);
  assert.equal(events[0].data.device, ZONE);
  assert.equal(events[0].data.station_id, 999001);
  assert.equal(events[0].data.fast, 'yes');
  assert.equal(events[0].data.max_power_kw, 150);
  assert.match(events[0].data.summary, /^New charging station near Maison: Rue de la Tour Jacob/);
});

test('another search is a new baseline: no new_station for what it reveals', async (t) => {
  const { gladys, app } = await startApp({ config: { ...CONFIG, radius: '1' } });
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.configUpdated({ ...CONFIG, radius: '20', interval: '12' });
  assert.equal(app.getConfig().interval, 12);
  assert.equal(app.getConfig().filters.radiusKm, 20);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('failures keep the last snapshot, are reported, then the recovery', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ZONE);
  fetch.state.failure = 'network';
  await app.watcher.round();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(app.watcher.zones().length, 1, 'the last snapshot is kept');
  assert.equal(gladys.fake.lastState(`${ZONE}:stations`), 23);
  fetch.state.failure = 429;
  await app.watcher.round();
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  fetch.state.failure = null;
  await app.watcher.round();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a failure makes nothing appear');
});

test('typed positions, a wrong one, a house without a position; the check button', async (t) => {
  const { gladys, app, fetch } = await startApp({
    config: {
      api_key: KEY,
      coordinates_1: '49.6116, 6.1319',
      coordinates_2: 'Luxembourg',
      house_3: 'chalet',
    },
    houses: [{ ...HOUSE, selector: 'chalet', name: 'Chalet', latitude: null, longitude: null }],
  });
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    app.places().map((place) => [place.id, place.label]),
    [['pos-49-6116-6-1319', 'Place 1']],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /1 lieu\(x\) lu\(s\), 2 non/);
  const calls = fetch.calls.length;
  const ack = await gladys.fake.action(ACTIONS.CHECK);
  const text = JSON.stringify(ack.data);
  assert.match(
    text,
    /Lieu 1 \(49\.61160, 6\.13190\) : 20 bornes en service à moins de 5 km, dont 2 rapides/,
  );
  assert.match(text, /« Luxembourg » n’est pas une position/);
  assert.match(text, /La maison « Chalet » n’a pas de position/);
  assert.equal(fetch.calls.length, calls + 2, 'the reference data and one place');
});

test('the widgets read the snapshots, never Open Charge Map', async (t) => {
  const { gladys, app, fetch } = await startApp({ config: { ...CONFIG, offered: '50' } });
  t.after(() => gladys.fake.shutdown());
  await created(gladys, STATION(BELLE_ETOILE));
  await until(() => app.watcher.station(BELLE_ETOILE));
  const calls = fetch.calls.length;
  const nearby = await widget(gladys, WIDGETS.NEARBY, {
    language: 'fr',
    settings: { connector: 'ccs', min_power: '50' },
  });
  assert.deepEqual(validateWidgetContent(nearby), []);
  const cards = nearby.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(
    cards.map((card) => card.title),
    [
      'Rue Richard Coudenhove-Kalergi (Luxembourg)',
      'Tesla Supercharger Luxembourg Urban (Floor -3)',
    ],
  );
  assert.match(cards[0].subtitle, /^2,6 km · .* · 350 kW$/);
  const miles = await widget(gladys, WIDGETS.NEARBY, { language: 'en', units: 'us' });
  assert.match(miles.components.find((c) => c.type === 'card-list').items[0].subtitle, /^0\.5 mi/);

  const station = await widget(gladys, WIDGETS.STATION, {
    language: 'de',
    settings: { device: STATION(BELLE_ETOILE) },
  });
  assert.deepEqual(validateWidgetContent(station), []);
  assert.equal(station.components.find((c) => c.type === 'card-list').items.length, 4);
  assert.equal(fetch.calls.length, calls, 'a widget never costs a request');
});

test('the station widget: a station not added is asked for', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const content = await widget(gladys, WIDGETS.STATION, { language: 'en' });
  assert.match(content.components[0].text, /^Add a station device/);
});

test('find_station answers from the last reading, with its own filters', async (t) => {
  const { gladys, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const calls = fetch.calls.length;
  const any = (await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_STATION, {})).data.outputs;
  assert.equal(any.found, true);
  assert.equal(any.station_id, TOUR_JACOB);
  assert.equal(any.count, 23);
  const fast = (
    await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_STATION, {
      device: ZONE,
      connector: 'ccs',
      min_power: 100,
    })
  ).data.outputs;
  assert.equal(fast.station_id, 194234);
  assert.equal(fast.max_power_kw, 350);
  assert.equal(fast.distance_km, 2.65);
  assert.match(fast.summary, /^Nearest station: Rue Richard Coudenhove-Kalergi/);
  const none = (
    await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_STATION, {
      connector: 'chademo',
      min_power: 400,
    })
  ).data.outputs;
  assert.equal(none.found, false);
  assert.equal(none.name, '');
  assert.equal(fetch.calls.length, calls, 'no request');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a scene action never fires a trigger');
});

test('the reference data (operator names) is read once a day', async (t) => {
  const { gladys, app, fetch, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const reference = () => fetch.calls.filter((call) => call.path === '/v3/referencedata').length;
  await app.watcher.round();
  assert.equal(reference(), 1);
  clock.now = NOW + DAY + 1;
  await app.watcher.round();
  assert.equal(reference(), 2);
  assert.equal(app.watcher.zones()[0].stations[0].operator, 'Enovos');
});
