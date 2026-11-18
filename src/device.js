// -----------------------------------------------------------------------------
// The devices of the Open Charge Map integration, offered on the Discovery
// screen.
//
// One "zone" device per place of the configuration ("Charging stations ·
// Home"), on the stations around it that match the search:
//   - stations   counter-sensor / integer: stations in service;
//   - fast       counter-sensor / integer: of them, those of 50 kW or more;
//   - nearest    distance-sensor / decimal, km: the nearest in service;
//   - summary    text / text: the same as a sentence.
//
// One "station" device per charging station the user wants to follow, among
// the nearest of each place:
//   - status     charging-station / connector-status, 0 to 4 (available,
//                occupied, reserved, unavailable, faulted), from the status
//                Open Charge Map knows: "in service" most of the time, the
//                live occupancy only where an operator shares it;
//   - points     counter-sensor / integer: charging points;
//   - details    text / text: power, connectors, access, cost;
//   - checkin    text / text: the last check-in or comment of a driver.
//
// External ids are built on the place id (the house selector, or the typed
// position) and on the Open Charge Map station id, never on a display name.
//
// Open Charge Map has no push: the integration reads it on its own timer, so
// `should_poll` is false. Every feature is read-only.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { isFast, connectorsText, formatKw } from './stations.js';
import { MAX_RESULTS } from './ocm-api.js';
import { formatDistance, formatDay } from './format.js';
import { t } from './i18n.js';

const DEVICE_TYPES = { ZONE: 'zone', STATION: 'station' };
const MAX_POINTS = 999;
const MAX_DISTANCE_KM = 100;

const ZONE_KEYS = { STATIONS: 'stations', FAST: 'fast', NEAREST: 'nearest', SUMMARY: 'summary' };
const STATION_KEYS = { STATUS: 'status', POINTS: 'points', DETAILS: 'details', CHECKIN: 'checkin' };

const shapes = {
  counter: (max) => ({
    category: CATEGORIES.COUNTER_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max,
  }),
  distance: {
    category: CATEGORIES.DISTANCE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.KM,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: MAX_DISTANCE_KM,
  },
  connector: {
    category: CATEGORIES.CHARGING_STATION,
    type: TYPES.CHARGING_STATION.CONNECTOR_STATUS,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: 4,
  },
  text: {
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 0,
  },
};

/**
 * @description The external ids of a zone or a station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - DEVICE_TYPES value.
 * @param {string|number} id - Place id, or station id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, String(id));
}

/**
 * @description What a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @returns {{ type: string, id: string }|null} The zone (place id) or the
 * station (Open Charge Map id, as text).
 * @example
 * targetOf('ext:open-charge-map:station:102103:status'); // -> { type: 'station', id: '102103' }
 */
function targetOf(externalId) {
  const match = /:(zone|station):([a-z0-9-]+)(?::[a-z_]+)?$/i.exec(String(externalId ?? ''));
  return match ? { type: match[1].toLowerCase(), id: match[2].toLowerCase() } : null;
}

/**
 * @description The id of a place: the house selector, or the typed position
 * rounded to about 10 m ("pos-46-3069-4-8325").
 * @param {object} entry - `{ house, coordinates }` of the configuration.
 * @returns {string} The id (lower case letters, digits, hyphens).
 * @example
 * placeId({ house: 'maison' }); // -> 'house-maison'
 */
function placeId(entry) {
  if (entry.house && !entry.coordinates) {
    const slug = entry.house
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return `house-${slug || 'home'}`;
  }
  const part = (value) => value.toFixed(4).replace('-', 'm').replace('.', '-');
  return `pos-${part(entry.coordinates.latitude)}-${part(entry.coordinates.longitude)}`;
}

/**
 * @description The name of a place in a language: the house name, or
 * "Place 2" for a typed position.
 * @param {object} place - The place (`label`, `slot`, `typed`).
 * @param {string} language - The language.
 * @returns {string} The name.
 */
function placeLabel(place, language) {
  return place.typed ? t('placeN', language, { n: place.slot }) : place.label;
}

/**
 * @description The name of a zone device.
 * @param {object} place - The place.
 * @param {string} language - The language.
 * @returns {string} "Charging stations · Home".
 */
function zoneName(place, language) {
  return t('zoneName', language, { place: placeLabel(place, language) });
}

/**
 * @description The name of a station device: its title, and its town when
 * the title does not hold it.
 * @param {object} station - The station.
 * @returns {string} "Bauhaus Capellen", "Lidl (Mâcon)".
 */
function stationName(station) {
  const { name, town } = station;
  if (!town || name.toLowerCase().includes(town.toLowerCase())) {
    return name;
  }
  return `${name} (${town})`;
}

/**
 * @description The stations of a zone in service.
 * @param {object} snapshot - The zone snapshot.
 * @returns {object[]} Nearest first.
 */
function inService(snapshot) {
  return snapshot.stations.filter((station) => station.operational !== false);
}

/**
 * @description The situation of a zone, as one sentence.
 * @param {object} snapshot - The zone snapshot.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function zoneSummary(snapshot, language) {
  const radius = formatDistance(snapshot.radiusKm, language);
  const up = inService(snapshot);
  if (up.length === 0) {
    return t('zoneNone', language, { radius });
  }
  const nearest = up[0];
  return [
    t('zoneCount', language, {
      count: snapshot.capped ? `${up.length}+` : up.length,
      fast: up.filter(isFast).length,
      radius,
    }),
    t('zoneNearest', language, {
      name: stationName(nearest),
      distance: formatDistance(nearest.distanceKm, language),
    }),
  ].join(' ');
}

/**
 * @description The status of a station as words.
 * @param {object} station - The station.
 * @param {string} language - The language.
 * @returns {string} "In service".
 */
const statusText = (station, language) => t(`status_${station.status}`, language);

/**
 * @description The details of a station as one line.
 * @param {object} station - The station.
 * @param {string} language - The language.
 * @returns {string} "22 kW max · 4 × Type 2 22 kW · Public · Free 1 hour".
 */
function detailsText(station, language) {
  return [
    station.maxPowerKw ? t('maxPower', language, { kw: formatKw(station.maxPowerKw) }) : null,
    connectorsText(station),
    t(`usage_${station.usage}`, language),
    station.cost,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * @description A check-in as words: "Charged successfully, 12/11/2026 (Ana)".
 * @param {object|null} checkin - The check-in.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function checkinText(checkin, language) {
  if (!checkin) {
    return t('checkinNone', language);
  }
  const kind = checkin.kind
    ? t(`checkin_${checkin.kind}`, language)
    : t('checkinComment', language);
  return [
    `${kind}, ${formatDay(checkin.at, language)}${checkin.user ? ` (${checkin.user})` : ''}`,
    checkin.comment ? t('quoted', language, { text: checkin.comment.slice(0, 200) }) : null,
  ]
    .filter(Boolean)
    .join(' ');
}

const ZONE_FEATURES = [
  {
    key: ZONE_KEYS.STATIONS,
    name: 'featureStations',
    shape: shapes.counter(MAX_RESULTS),
    state: (snapshot) => Math.min(MAX_RESULTS, inService(snapshot).length),
  },
  {
    key: ZONE_KEYS.FAST,
    name: 'featureFast',
    shape: shapes.counter(MAX_RESULTS),
    state: (snapshot) => Math.min(MAX_RESULTS, inService(snapshot).filter(isFast).length),
  },
  {
    key: ZONE_KEYS.NEAREST,
    name: 'featureNearest',
    shape: shapes.distance,
    state: (snapshot) => {
      const nearest = inService(snapshot)[0];
      return nearest ? Math.min(MAX_DISTANCE_KM, Math.round(nearest.distanceKm * 100) / 100) : null;
    },
  },
  {
    key: ZONE_KEYS.SUMMARY,
    name: 'featureSummary',
    shape: shapes.text,
    state: (snapshot, language) => ({ text: zoneSummary(snapshot, language) }),
  },
];

const STATION_FEATURES = [
  {
    key: STATION_KEYS.STATUS,
    name: 'featureStatus',
    shape: shapes.connector,
    state: (snapshot) => snapshot.station.connector,
  },
  {
    key: STATION_KEYS.POINTS,
    name: 'featurePoints',
    shape: shapes.counter(MAX_POINTS),
    state: (snapshot) => Math.min(MAX_POINTS, snapshot.station.points),
  },
  {
    key: STATION_KEYS.DETAILS,
    name: 'featureDetails',
    shape: shapes.text,
    state: (snapshot, language) => ({
      text: `${statusText(snapshot.station, language)} · ${detailsText(snapshot.station, language)}`,
    }),
  },
  {
    key: STATION_KEYS.CHECKIN,
    name: 'featureCheckin',
    shape: shapes.text,
    state: (snapshot, language) => ({
      text: checkinText(snapshot.station.checkins[0] ?? null, language),
    }),
  },
];

/**
 * @description The device of a place.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} place - The resolved place.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildZoneDevice(gladys, place, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.ZONE, place.id);
  return {
    name: zoneName(place, language),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'OCM_LATITUDE', value: place.latitude.toFixed(5) },
      { name: 'OCM_LONGITUDE', value: place.longitude.toFixed(5) },
    ],
    features: ZONE_FEATURES.map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description The device of a station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - The station.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, station, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, station.id);
  return {
    name: stationName(station),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'OCM_ID', value: String(station.id) },
      { name: 'OCM_URL', value: station.url },
    ],
    features: STATION_FEATURES.map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description States of features, an unknown value left out.
 * @param {object} ids - From idsOf.
 * @param {object[]} specs - The features.
 * @param {object} snapshot - The snapshot.
 * @param {string} language - Language of the texts.
 * @returns {object[]} The states.
 */
function statesOf(ids, specs, snapshot, language) {
  return specs.flatMap((spec) => {
    const value = spec.state(snapshot, language);
    const id = ids.feature(spec.key);
    if (value === null || value === undefined) {
      return [];
    }
    return typeof value === 'object'
      ? [{ device_feature_external_id: id, text: value.text.slice(0, 1000) }]
      : [{ device_feature_external_id: id, state: value }];
  });
}

/**
 * @description The states of a zone.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The zone snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildZoneStates(gladys, snapshot, language) {
  return statesOf(
    idsOf(gladys, DEVICE_TYPES.ZONE, snapshot.place.id),
    ZONE_FEATURES,
    snapshot,
    language,
  );
}

/**
 * @description The states of a station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The station snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildStationStates(gladys, snapshot, language) {
  return statesOf(
    idsOf(gladys, DEVICE_TYPES.STATION, snapshot.station.id),
    STATION_FEATURES,
    snapshot,
    language,
  );
}

export {
  DEVICE_TYPES,
  ZONE_KEYS,
  STATION_KEYS,
  ZONE_FEATURES,
  STATION_FEATURES,
  MAX_DISTANCE_KM,
  idsOf,
  targetOf,
  placeId,
  placeLabel,
  zoneName,
  stationName,
  inService,
  zoneSummary,
  statusText,
  detailsText,
  checkinText,
  buildZoneDevice,
  buildStationDevice,
  buildZoneStates,
  buildStationStates,
};
