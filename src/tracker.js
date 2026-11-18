// -----------------------------------------------------------------------------
// What happened between two readings (pure logic): the transitions behind
// the scene triggers.
//
//   - new_station             a station appears around a place (zone);
//   - station_status_changed  a followed station (a station device the user
//                             created) changes status;
//   - new_checkin             someone reports a visit or a problem at a
//                             followed station.
//
// The first reading of a zone or a station is a baseline: nothing is replayed
// after a restart. A zone whose search changed (radius, filters, position) is
// a new baseline too. A failed reading keeps the last snapshot: it never
// makes a station "disappear" nor "appear".
// -----------------------------------------------------------------------------

const SCENE_TRIGGERS = {
  NEW_STATION: 'new_station',
  STATION_STATUS_CHANGED: 'station_status_changed',
  NEW_CHECKIN: 'new_checkin',
};

const DAY_MS = 86400000;
// A station that was created long ago and now shows up is a station the
// search did not return before (the 250 nearest moved, a filter edge, an
// edit of its connectors): not a new station.
const NEW_STATION_MAX_AGE_MS = 60 * DAY_MS;
// A check-in older than this, seen for the first time, is a late
// publication: not news anymore.
const NEW_CHECKIN_MAX_AGE_MS = 14 * DAY_MS;
// At most this many events of a kind per zone or station and per reading.
const MAX_EVENTS = 5;

/**
 * @description The new stations of a zone.
 * @param {object|null} previous - The last zone snapshot.
 * @param {object} next - The new one (`{ search, stations }`).
 * @param {number} now - Now, in ms.
 * @returns {Array<{ key: string, station: object }>} The events.
 * @example
 * diffZone(previous, next, Date.now());
 */
function diffZone(previous, next, now) {
  if (!previous || previous.search !== next.search) {
    return [];
  }
  const known = new Set(previous.stations.map((station) => station.id));
  return next.stations
    .filter(
      (station) =>
        !known.has(station.id) &&
        Number.isFinite(station.createdAt) &&
        now - station.createdAt <= NEW_STATION_MAX_AGE_MS,
    )
    .slice(0, MAX_EVENTS)
    .map((station) => ({ key: SCENE_TRIGGERS.NEW_STATION, station }));
}

/**
 * @description How a status moved: "unavailable" (out of service), "available"
 * (back in service) or "other".
 * @param {object} before - The previous station.
 * @param {object} after - The new station.
 * @returns {string} The change.
 */
function changeOf(before, after) {
  if (before.operational !== false && after.operational === false) {
    return 'unavailable';
  }
  if (before.operational !== true && after.operational === true) {
    return 'available';
  }
  return 'other';
}

/**
 * @description The transitions of a followed station.
 * @param {object|null} previous - The last station snapshot (`{ station }`).
 * @param {object} next - The new one.
 * @param {number} now - Now, in ms.
 * @returns {Array<object>} The events: `{ key, station, previous, change }`
 * for a status, `{ key, station, checkin }` for a check-in.
 * @example
 * diffStation(previous, next, Date.now());
 */
function diffStation(previous, next, now) {
  if (!previous) {
    return [];
  }
  const before = previous.station;
  const after = next.station;
  const events = [];
  if (before.status !== after.status) {
    events.push({
      key: SCENE_TRIGGERS.STATION_STATUS_CHANGED,
      station: after,
      previous: before.status,
      change: changeOf(before, after),
    });
  }
  const seen = new Set(before.checkins.map((checkin) => checkin.id));
  const newest = Math.max(0, ...before.checkins.map((checkin) => checkin.id));
  after.checkins
    .filter(
      (checkin) =>
        !seen.has(checkin.id) &&
        checkin.id > newest &&
        (!Number.isFinite(checkin.at) || now - checkin.at <= NEW_CHECKIN_MAX_AGE_MS),
    )
    .slice(0, MAX_EVENTS)
    // Oldest first: the scenes run in the order things happened.
    .reverse()
    .forEach((checkin) =>
      events.push({ key: SCENE_TRIGGERS.NEW_CHECKIN, station: after, checkin }),
    );
  return events;
}

export {
  SCENE_TRIGGERS,
  NEW_STATION_MAX_AGE_MS,
  NEW_CHECKIN_MAX_AGE_MS,
  MAX_EVENTS,
  diffZone,
  changeOf,
  diffStation,
};
