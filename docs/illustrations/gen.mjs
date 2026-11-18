// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Two cards on a November evening, from real stations around Luxembourg City
// (the test fixtures: the public export of Open Charge Map, CC BY 4.0),
// through the real code (src/stations.js) and the real widget builders
// (src/widgets.js): the nearest stations of a house, and a fast station with
// the check-ins of three drivers (written for the illustration).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildNearbyWidget, buildStationWidget } = await load('src/widgets.js');
const { readStations, readStation, matches, distanceKm } = await load('src/stations.js');
const { readReferenceData } = await load('src/reference.js');
const { LANGUAGES } = await load('src/i18n.js');
const { NOW, HOUR, NEARBY, REFERENCE, HOUSE, rawStation } = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const reference = readReferenceData(REFERENCE);
const place = { id: 'house-maison', slot: 1, label: 'Maison', ...HOUSE };
const zone = {
  place,
  radiusKm: 5,
  capped: false,
  fetchedAt: NOW - 2 * HOUR,
  stations: readStations(NEARBY, place, reference).filter(
    (station) => station.distanceKm <= 5 && matches(station, { publicOnly: true }),
  ),
};
const kirchberg = rawStation(194234, {
  DateLastVerified: '2026-10-02T09:00:00Z',
  UserComments: [
    {
      ID: 3,
      CheckinStatusTypeID: 10,
      UserName: 'Lena',
      DateCreated: '2026-11-15T17:40:00Z',
      Comment: '160 kW on the 350 kW plug, 20 to 80 % in 22 min.',
    },
    {
      ID: 2,
      CheckinStatusTypeID: 110,
      UserName: 'Marc',
      DateCreated: '2026-11-08T12:10:00Z',
      Comment: 'Two spots taken by petrol cars at lunchtime.',
    },
    { ID: 1, CheckinStatusTypeID: 10, UserName: 'Joao', DateCreated: '2026-10-29T07:55:00Z' },
  ],
});
const station = readStation(kirchberg, reference);
const fast = {
  station: {
    ...station,
    distanceKm: distanceKm(place.latitude, place.longitude, station.latitude, station.longitude),
  },
  fetchedAt: NOW - 2 * HOUR,
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    nearby: buildNearbyWidget({ snapshot: zone, language, now: NOW, pollHours: 6 }),
    station: buildStationWidget({ snapshot: fast, language, now: NOW, pollHours: 6 }),
  };
}
const card = (key) => {
  const widget = manifest.widgets.find((w) => w.key === key);
  return { icon: widget.icon, label: widget.label };
};
writeFileSync(
  out,
  JSON.stringify({
    now: NOW,
    widgets: { nearby: card('nearby'), station: card('station') },
    contents,
  }),
);
