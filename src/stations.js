// -----------------------------------------------------------------------------
// Stations of Open Charge Map, read from the compact answers of /poi (pure).
//
// A raw station (recorded in November 2026, compact=true&verbose=false):
//   { ID, UUID, DataProviderID, OperatorID, UsageTypeID, UsageCost,
//     AddressInfo: { Title, AddressLine1, Town, Postcode, CountryID,
//                    Latitude, Longitude, AccessComments, Distance? },
//     Connections: [{ ID, ConnectionTypeID, StatusTypeID, LevelID, Amps,
//                     Voltage, PowerKW, CurrentTypeID, Quantity }],
//     NumberOfPoints, GeneralComments, StatusTypeID, DateLastVerified,
//     DateLastStatusUpdate, DateCreated, SubmissionStatusTypeID,
//     UserComments?: [{ ID, CommentTypeID, UserName, Comment, Rating,
//                       DateCreated, CheckinStatusTypeID }] }
// Null fields are left out; most fields may be missing.
// -----------------------------------------------------------------------------

import {
  STATUSES,
  HIDDEN_STATUSES,
  USAGES,
  PRIVATE_USAGES,
  CHECKINS,
  FAULT_REPORT_COMMENT,
  CONNECTION_TYPES,
  OCM_PROVIDER,
  EMPTY_REFERENCE,
  groupOf,
} from './reference.js';

const FAST_KW = 50;
const MAX_CHECKINS = 10;
const DETAILS_URL = 'https://openchargemap.org/poi/details/';

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const instant = (value) => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/**
 * @description Great-circle distance between two points.
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} The distance, in km.
 * @example
 * distanceKm(46.3069, 4.8325, 46.2, 4.8); // -> ~12.1
 */
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @description The power of a connection: PowerKW, or volts x amps when only
 * those are given.
 * @param {object} raw - The raw connection.
 * @returns {number|null} kW, one decimal.
 */
function powerOf(raw) {
  let kw = number(raw.PowerKW);
  if (kw === null && number(raw.Amps) && number(raw.Voltage)) {
    // Three-phase: 230 V is a phase voltage (3 x V x I), 400 V a line
    // voltage (√3 x V x I).
    let factor = 1;
    if (raw.CurrentTypeID === 20) {
      factor = raw.Voltage < 300 ? 3 : Math.sqrt(3);
    }
    kw = (raw.Amps * raw.Voltage * factor) / 1000;
  }
  return kw !== null && kw > 0 ? Math.round(kw * 10) / 10 : null;
}

/**
 * @description A check-in or a comment.
 * @param {object} raw - The raw UserComment.
 * @returns {object|null} `{ id, at, kind, outcome, comment, user, rating }`.
 */
function readCheckin(raw) {
  if (!raw || !Number.isInteger(raw.ID)) {
    return null;
  }
  const known = CHECKINS[raw.CheckinStatusTypeID];
  let kind = known?.key ?? null;
  let outcome = known?.outcome ?? 'other';
  if (!known && raw.CommentTypeID === FAULT_REPORT_COMMENT) {
    kind = 'fault_report';
    outcome = 'failure';
  }
  return {
    id: raw.ID,
    at: instant(raw.DateCreated),
    kind,
    outcome,
    comment: text(raw.Comment),
    user: text(raw.UserName) ?? text(raw.User?.Username),
    rating: number(raw.Rating),
  };
}

/**
 * @description The status of a station: its own, or the one of its
 * connections when the station gives none.
 * @param {object} raw - The raw station.
 * @param {object[]} connections - Its connections.
 * @returns {number} A StatusTypeID.
 */
function statusIdOf(raw, connections) {
  if (STATUSES[raw.StatusTypeID] && raw.StatusTypeID !== 0) {
    return raw.StatusTypeID;
  }
  const known = connections.map((c) => c.statusId).filter((id) => STATUSES[id] && id !== 0);
  if (known.length === 0) {
    return 0;
  }
  const up = known.filter((id) => STATUSES[id].operational);
  if (up.length === known.length) {
    return known.every((id) => id === known[0]) ? known[0] : 50;
  }
  return up.length > 0 ? 75 : 100;
}

/**
 * @description A station of a /poi answer.
 * @param {object} raw - The raw station.
 * @param {object} [reference] - Lookups of readReferenceData.
 * @returns {object|null} The station, null for an entry without a position.
 * @example
 * const station = readStation(raw, reference);
 */
function readStation(raw, reference = EMPTY_REFERENCE) {
  const address = raw?.AddressInfo ?? {};
  const latitude = number(address.Latitude);
  const longitude = number(address.Longitude);
  if (!Number.isInteger(raw?.ID) || latitude === null || longitude === null) {
    return null;
  }
  const connections = (Array.isArray(raw.Connections) ? raw.Connections : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const typeId = Number.isInteger(entry.ConnectionTypeID) ? entry.ConnectionTypeID : 0;
      return {
        typeId,
        label: CONNECTION_TYPES[typeId] ?? `#${typeId}`,
        group: groupOf(typeId),
        powerKw: powerOf(entry),
        quantity: Number.isInteger(entry.Quantity) && entry.Quantity > 0 ? entry.Quantity : 1,
        statusId: Number.isInteger(entry.StatusTypeID) ? entry.StatusTypeID : null,
      };
    });
  const statusId = statusIdOf(raw, connections);
  const status = STATUSES[statusId];
  const usage = USAGES[raw.UsageTypeID] ?? 'unknown';
  const quantities = connections.reduce((sum, connection) => sum + connection.quantity, 0);
  const powers = connections.map((connection) => connection.powerKw).filter((kw) => kw !== null);
  const providerId = Number.isInteger(raw.DataProviderID) ? raw.DataProviderID : OCM_PROVIDER.id;
  const checkins = (Array.isArray(raw.UserComments) ? raw.UserComments : [])
    .map(readCheckin)
    .filter(Boolean)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || b.id - a.id)
    .slice(0, MAX_CHECKINS);
  return {
    id: raw.ID,
    name: text(address.Title) ?? `Open Charge Map ${raw.ID}`,
    street: text(address.AddressLine1),
    town: text(address.Town),
    postcode: text(address.Postcode),
    latitude,
    longitude,
    operatorId: Number.isInteger(raw.OperatorID) ? raw.OperatorID : null,
    operator: reference.operators.get(raw.OperatorID) ?? null,
    usage,
    isPublic: !PRIVATE_USAGES.has(usage),
    cost: text(raw.UsageCost),
    access: text(address.AccessComments),
    statusId,
    status: status.key,
    connector: status.connector,
    operational: status.operational,
    hidden: HIDDEN_STATUSES.has(statusId),
    points:
      Number.isInteger(raw.NumberOfPoints) && raw.NumberOfPoints > 0
        ? raw.NumberOfPoints
        : quantities,
    connections,
    maxPowerKw: powers.length > 0 ? Math.max(...powers) : null,
    provider: reference.providers.get(providerId) ?? {
      id: providerId,
      title: `#${providerId}`,
      license: '',
    },
    verifiedAt: instant(raw.DateLastVerified),
    statusAt: instant(raw.DateLastStatusUpdate),
    createdAt: instant(raw.DateCreated),
    checkins,
    url: `${DETAILS_URL}${raw.ID}`,
  };
}

/**
 * @description Whether a station is fast (a connector of 50 kW or more).
 * @param {object} station - The station.
 * @returns {boolean} Fast or not.
 */
const isFast = (station) => (station.maxPowerKw ?? 0) >= FAST_KW;

/**
 * @description Whether a station matches the filters of the settings.
 * @param {object} station - The station.
 * @param {object} filters - `{ minPowerKw, groups, publicOnly }`.
 * @returns {boolean} Kept or not.
 * @example
 * matches(station, { minPowerKw: 22, groups: ['type2'], publicOnly: true });
 */
function matches(station, { minPowerKw = 0, groups = [], publicOnly = false } = {}) {
  if (station.hidden || (publicOnly && !station.isPublic)) {
    return false;
  }
  const connections = station.connections.filter(
    (connection) => groups.length === 0 || groups.includes(connection.group),
  );
  if (groups.length > 0 && connections.length === 0) {
    return false;
  }
  // A connector of unknown power is not ruled out by the type filter alone,
  // but a power filter needs a known power.
  return (
    minPowerKw <= 0 || connections.some((connection) => (connection.powerKw ?? 0) >= minPowerKw)
  );
}

/**
 * @description The connectors of a station, grouped: "4 × Type 2 22 kW, 2 × CCS2 150 kW".
 * @param {object} station - The station.
 * @param {number} [max] - Groups shown at most.
 * @returns {string} The connectors.
 */
function connectorsText(station, max = 4) {
  const groups = new Map();
  for (const connection of station.connections) {
    const key = `${connection.label}|${connection.powerKw ?? ''}`;
    const entry = groups.get(key) ?? { ...connection, quantity: 0 };
    entry.quantity += connection.quantity;
    groups.set(key, entry);
  }
  const parts = [...groups.values()]
    .sort((a, b) => (b.powerKw ?? 0) - (a.powerKw ?? 0))
    .map(
      (entry) =>
        `${entry.quantity} × ${entry.label}${entry.powerKw ? ` ${formatKw(entry.powerKw)} kW` : ''}`,
    );
  return parts.length > max ? `${parts.slice(0, max).join(', ')}…` : parts.join(', ');
}

/**
 * @description "22", "7.4", "150".
 * @param {number} kw - The power.
 * @returns {string} The power, without unit.
 */
function formatKw(kw) {
  return Number.isInteger(kw) ? String(kw) : kw.toFixed(1);
}

/**
 * @description The address of a station on one line.
 * @param {object} station - The station.
 * @returns {string} "37 Parc d'activités, 8308 Capellen".
 */
function addressText(station) {
  const town = [station.postcode, station.town].filter(Boolean).join(' ');
  return [station.street, town].filter(Boolean).join(', ');
}

/**
 * @description The stations of a place: read, positioned, sorted by distance.
 * @param {object[]} raws - Raw stations.
 * @param {object} place - `{ latitude, longitude }`.
 * @param {object} [reference] - Lookups of readReferenceData.
 * @returns {object[]} Stations with `distanceKm`, nearest first.
 */
function readStations(raws, place, reference) {
  return raws
    .map((raw) => readStation(raw, reference))
    .filter(Boolean)
    .map((station) => ({
      ...station,
      distanceKm: distanceKm(place.latitude, place.longitude, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export {
  FAST_KW,
  DETAILS_URL,
  distanceKm,
  powerOf,
  readCheckin,
  readStation,
  readStations,
  isFast,
  matches,
  connectorsText,
  formatKw,
  addressText,
};
