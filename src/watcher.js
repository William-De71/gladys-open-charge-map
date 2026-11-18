// -----------------------------------------------------------------------------
// The reading loop: every `interval` hours, one request to Open Charge Map per
// place (the stations around it), and one more for the followed stations
// (the station devices the user created, with their check-ins).
//
// It keeps the snapshots the devices, widgets, scene actions and triggers
// read, and hands each round to the app with its transitions (tracker.js).
// Requests go one after the other, a short pause between two, never in
// parallel. A round never overlaps another one; a failed request keeps the
// last snapshot and is reported with its error.
// -----------------------------------------------------------------------------

import { readStations, readStation, matches, distanceKm } from './stations.js';
import { typesOf } from './reference.js';
import { diffZone, diffStation } from './tracker.js';
import { MAX_RESULTS } from './ocm-api.js';

// Pause between two requests of the same round.
const PAUSE_MS = 1000;

/**
 * @description The signature of the search of a place: a zone read with
 * another one is a new baseline.
 * @param {object} place - `{ latitude, longitude }`.
 * @param {object} filters - The filters of the configuration.
 * @returns {string} The signature.
 */
function searchOf(place, filters) {
  return JSON.stringify([
    place.latitude.toFixed(4),
    place.longitude.toFixed(4),
    filters.radiusKm,
    filters.minPowerKw,
    filters.groups,
    filters.publicOnly,
  ]);
}

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.ocm - The Open Charge Map client.
 * @param {Function} options.getKey - `() => string|null`: the API key.
 * @param {Function} options.getPlaces - `async () => places`: the resolved
 * places (`{ id, label, latitude, longitude }`).
 * @param {Function} options.getFilters - `() => filters` of the configuration.
 * @param {Function} options.getFollowed - `() => number[]`: ids of the
 * followed stations.
 * @param {Function} options.getReference - `async () => reference` lookups.
 * @param {Function} options.getIntervalMs - `() => number`.
 * @param {Function} options.onRound - `async ({ zones, stations, errors, partial }) => void`:
 * each zone and station read as `{ snapshot, events, changed }`, each failure
 * as `{ place, error }` (place null for the followed stations); `partial`
 * when only the followed stations were read.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ ocm, getKey, getPlaces, ... });
 * watcher.start();
 */
function createWatcher({
  ocm,
  getKey,
  getPlaces,
  getFilters,
  getFollowed,
  getReference,
  getIntervalMs,
  onRound,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger,
}) {
  // place id -> zone snapshot; station id -> station snapshot
  let zones = new Map();
  let stations = new Map();
  let fetchedAt = null;
  let timer = null;
  let running = null;
  let started = false;
  let places = [];

  /**
   * @description Read the stations around one place.
   * @param {object} place - The resolved place.
   * @returns {Promise<object>} The zone snapshot.
   */
  async function readZone(place) {
    const filters = getFilters();
    const reference = await getReference();
    const raws = await ocm.nearby(getKey(), {
      latitude: place.latitude,
      longitude: place.longitude,
      radiusKm: filters.radiusKm,
      minPowerKw: filters.minPowerKw,
      connectionTypeIds: typesOf(filters.groups),
    });
    return {
      place,
      search: searchOf(place, filters),
      radiusKm: filters.radiusKm,
      stations: readStations(raws, place, reference)
        .filter((station) => station.distanceKm <= filters.radiusKm * 1.05)
        .filter((station) => matches(station, filters)),
      capped: raws.length >= MAX_RESULTS,
      fetchedAt: now(),
    };
  }

  /**
   * @description The distance of a station to the nearest place.
   * @param {object} station - The station.
   * @returns {number|null} km.
   */
  function nearestDistance(station) {
    const distances = places.map((place) =>
      distanceKm(place.latitude, place.longitude, station.latitude, station.longitude),
    );
    return distances.length > 0 ? Math.min(...distances) : null;
  }

  /**
   * @description Read the followed stations, with their check-ins.
   * @param {number[]} ids - Station ids.
   * @returns {Promise<object[]>} Station snapshots.
   */
  async function readFollowed(ids) {
    const reference = await getReference();
    const raws = await ocm.stations(getKey(), ids);
    return raws
      .map((raw) => readStation(raw, reference))
      .filter(Boolean)
      .map((station) => ({
        station: { ...station, distanceKm: nearestDistance(station) },
        fetchedAt: now(),
      }));
  }

  /**
   * @description Read the followed stations into a round.
   * @param {object} round - The round being built.
   * @returns {Promise<void>}
   */
  async function followedPart(round) {
    const ids = getFollowed();
    const nextStations = new Map();
    if (ids.length > 0) {
      try {
        const read = await readFollowed(ids);
        for (const snapshot of read) {
          const previous = stations.get(snapshot.station.id);
          nextStations.set(snapshot.station.id, snapshot);
          round.stations.push({
            snapshot,
            events: diffStation(previous, snapshot, now()),
            changed: !previous || signature(previous) !== signature(snapshot),
          });
        }
        // A station Open Charge Map no longer returns (deleted, merged) keeps
        // its last snapshot: nothing is invented about it.
        for (const id of ids) {
          if (!nextStations.has(id) && stations.has(id)) {
            nextStations.set(id, stations.get(id));
          }
        }
      } catch (err) {
        logger.warn(`Open Charge Map reading failed for the followed stations: ${err.message}`);
        ids
          .filter((id) => stations.has(id))
          .forEach((id) => nextStations.set(id, stations.get(id)));
        round.errors.push({ place: null, error: err });
      }
    }
    stations = nextStations;
  }

  /**
   * @description One reading of every place and of the followed stations.
   * @returns {Promise<void>}
   */
  async function readAll() {
    places = await getPlaces();
    const round = { zones: [], stations: [], errors: [], partial: false };
    const nextZones = new Map();
    for (const [index, place] of places.entries()) {
      if (index > 0) {
        await sleep(PAUSE_MS);
      }
      const previous = zones.get(place.id);
      try {
        const snapshot = await readZone(place);
        nextZones.set(place.id, snapshot);
        round.zones.push({
          snapshot,
          events: diffZone(previous, snapshot, now()),
          changed: !previous || signature(previous) !== signature(snapshot),
        });
      } catch (err) {
        logger.warn(`Open Charge Map reading failed for ${place.label}: ${err.message}`);
        if (previous) {
          nextZones.set(place.id, previous);
        }
        round.errors.push({ place, error: err });
      }
    }
    zones = nextZones;
    if (places.length > 0 && getFollowed().length > 0) {
      await sleep(PAUSE_MS);
    }
    await followedPart(round);
    fetchedAt = now();
    await onRound(round);
  }

  /**
   * @description Read only the followed stations (a station device was
   * just created): no zone is asked again.
   * @returns {Promise<void>}
   */
  async function readStationsOnly() {
    const round = { zones: [], stations: [], errors: [], partial: true };
    await followedPart(round);
    await onRound(round);
  }

  /**
   * @description What a device shows of a snapshot, to publish only changes.
   * @param {object} snapshot - A zone or station snapshot.
   * @returns {string} The signature.
   */
  function signature(snapshot) {
    return JSON.stringify(snapshot, (key, value) => (key === 'fetchedAt' ? undefined : value));
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getIntervalMs());
      timer.unref?.();
    }
  }

  /**
   * @description Read everything now; joins a round already running.
   * @returns {Promise<void>} Never rejects: failures are logged.
   */
  function round() {
    if (running) {
      return running;
    }
    running = readAll()
      .catch((err) => logger.error('Open Charge Map reading round failed', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  /**
   * @description Read the followed stations now, after a running round.
   * @returns {Promise<void>} Never rejects: failures are logged.
   */
  async function refreshStations() {
    if (running) {
      await running;
    }
    running = readStationsOnly()
      .catch((err) => logger.error('Open Charge Map station reading failed', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    round,
    refreshStations,
    readZone,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    zones: () => [...zones.values()],
    zone: (id) => zones.get(id) ?? null,
    stations: () => [...stations.values()],
    station: (id) => stations.get(id) ?? null,
    fetchedAt: () => fetchedAt,
  };
}

export { PAUSE_MS, searchOf, createWatcher };
