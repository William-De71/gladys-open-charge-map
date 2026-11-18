import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildNearbyWidget,
  buildStationWidget,
  readNearbySettings,
  messageContent,
  attribution,
  linksOf,
} from '../src/widgets.js';
import { readStations, readStation, matches } from '../src/stations.js';
import { readReferenceData } from '../src/reference.js';
import { LANGUAGES } from '../src/i18n.js';
import { NEARBY, FOLLOWED, REFERENCE, HOUSE, NOW, HOUR, BELLE_ETOILE } from './helpers/fixtures.js';

const reference = readReferenceData(REFERENCE);
const PLACE = {
  id: 'house-maison',
  slot: 1,
  label: 'Maison',
  latitude: HOUSE.latitude,
  longitude: HOUSE.longitude,
};
const zone = {
  place: PLACE,
  radiusKm: 5,
  capped: false,
  fetchedAt: NOW - 2 * HOUR,
  stations: readStations(NEARBY, PLACE, reference).filter(
    (station) => station.distanceKm <= 5 && matches(station, { publicOnly: true }),
  ),
};
const followed = {
  station: {
    ...readStation(
      FOLLOWED.find((raw) => raw.ID === BELLE_ETOILE),
      reference,
    ),
    distanceKm: 6.15,
  },
  fetchedAt: NOW - HOUR,
};

test('settings: unknown values fall back to the defaults', () => {
  assert.deepEqual(readNearbySettings(), { connector: 'any', minPowerKw: 0, count: 5 });
  assert.deepEqual(readNearbySettings({ connector: 'tesla', min_power: '150', count: '8' }), {
    connector: 'tesla',
    minPowerKw: 150,
    count: 8,
  });
  assert.deepEqual(readNearbySettings({ connector: 'x', min_power: '33', count: '100' }), {
    connector: 'any',
    minPowerKw: 0,
    count: 5,
  });
});

test('nearby: valid in every language and unit system, the attribution shown', () => {
  for (const language of LANGUAGES) {
    for (const units of ['metric', 'us']) {
      const content = buildNearbyWidget({
        snapshot: zone,
        language,
        units,
        now: NOW,
        pollHours: 6,
      });
      assert.deepEqual(validateWidgetContent(content), [], `${language} ${units}`);
      assert.ok(content.components.length <= 8);
    }
  }
  const content = buildNearbyWidget({ snapshot: zone, language: 'fr', now: NOW, pollHours: 6 });
  assert.equal(content.components[0].text, 'Maison · 5 km · lu il y a 2 h');
  assert.equal(content.ttl_seconds, 3600);
  const cards = content.components.find((c) => c.type === 'card-list').items;
  assert.equal(cards.length, 5);
  assert.deepEqual(cards[0].badge, { text: 'En service', color: 'success' });
  assert.match(cards[0].description, /^Prises : 4 × Type 2 22 kW\nAdresse : /);
  assert.match(cards[0].description, /Données : Open Charge Map \(CC BY 4\.0\)$/);
  assert.equal(cards[0].links.length, 2);
  // Every provider of the stations shown (Avenue John F. Kennedy: Oplaadpalen.nl).
  assert.equal(
    content.components.at(-1).text,
    'Données : Open Charge Map (CC BY 4.0), Oplaadpalen.nl (CC BY-NC-SA)',
  );
});

test('nearby: the filters of the widget, and an empty list', () => {
  const chademo = buildNearbyWidget({
    snapshot: zone,
    language: 'en',
    now: NOW,
    pollHours: 1,
    settings: readNearbySettings({ connector: 'chademo' }),
  });
  assert.equal(chademo.ttl_seconds, 3600);
  const [card] = chademo.components.find((c) => c.type === 'card-list').items;
  assert.equal(card.title, 'PWC (Luxemburg)');
  assert.deepEqual(card.badge, { text: 'In service', color: 'success' });
  const none = buildNearbyWidget({
    snapshot: zone,
    language: 'de',
    now: NOW,
    pollHours: 6,
    settings: readNearbySettings({ connector: 'chademo', min_power: '150' }),
  });
  assert.deepEqual(validateWidgetContent(none), []);
  assert.match(none.components.at(-1).text, /^Keine Ladestation im Umkreis von 5 km/);
});

test('station: valid in every language, check-ins, links, the budget of 8', () => {
  for (const language of LANGUAGES) {
    const content = buildStationWidget({ snapshot: followed, language, now: NOW, pollHours: 6 });
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.ok(content.components.length <= 8, `${content.components.length} components`);
  }
  const content = buildStationWidget({
    snapshot: followed,
    language: 'fr',
    now: NOW,
    pollHours: 6,
  });
  const status = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(status.at(-1), {
    label: 'Données',
    value: 'Open Charge Map (CC BY 4.0)',
    color: 'neutral',
  });
  const checkins = content.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(checkins[0].badge, { text: 'OK', color: 'success' });
  assert.equal(content.components.filter((c) => c.type === 'button').length, 2);
  const bare = buildStationWidget({
    snapshot: { ...followed, station: { ...followed.station, checkins: [], maxPowerKw: null } },
    language: 'en',
    now: NOW,
    pollHours: 6,
  });
  assert.deepEqual(validateWidgetContent(bare), []);
  assert.equal(
    bare.components.find((c) => c.type === 'card-list'),
    undefined,
  );
});

test('links and attribution', () => {
  const [details, directions] = linksOf(followed.station, 'es');
  assert.equal(details.url, 'https://openchargemap.org/poi/details/32022');
  assert.match(
    directions.url,
    /^https:\/\/www\.openstreetmap\.org\/directions\?to=49\.\d{5},6\.\d{5}#map=17\//,
  );
  assert.equal(
    attribution([followed.station, followed.station], 'en'),
    'Data: Open Charge Map (CC BY 4.0)',
  );
  assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(400))), []);
});
