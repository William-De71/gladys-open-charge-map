// -----------------------------------------------------------------------------
// The Open Charge Map integration: every handler, registered on a Gladys
// client.
//
// Brings the public charging stations of Open Charge Map into Gladys, around
// up to three places (a house of Gladys or a typed position):
//   - a "zone" device per place (stations in service, fast ones, the nearest)
//     and a device per station the user wants to follow (status, points,
//     details, last check-in), offered on the Discovery screen (device.js);
//   - scene triggers: new station around a place, status of a followed
//     station changed, new check-in at a followed station (tracker.js,
//     events.js);
//   - a scene action: find the nearest station matching a connector and a
//     power;
//   - dashboard widgets: the nearest stations, one station (widgets.js).
//
// Open Charge Map has no push: the integration reads its API on its own timer
// (ocm-api.js, watcher.js). Transport: cloud only. Nothing is ever written
// anywhere.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createOcmClient } from './ocm-api.js';
import { EMPTY_REFERENCE, readReferenceData } from './reference.js';
import { createWatcher } from './watcher.js';
import {
  DEVICE_TYPES,
  idsOf,
  targetOf,
  placeId,
  placeLabel,
  inService,
  buildZoneDevice,
  buildStationDevice,
  buildZoneStates,
  buildStationStates,
} from './device.js';
import { isFast } from './stations.js';
import { buildZoneEvent, buildStationEvent, buildFindOutputs } from './events.js';
import {
  WIDGETS,
  messageContent,
  readNearbySettings,
  buildNearbyWidget,
  buildStationWidget,
} from './widgets.js';
import { formatDistance } from './format.js';
import { LANGUAGES, t, all } from './i18n.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { CHECK: 'check' };
const SCENE_ACTIONS = { FIND_STATION: 'find_station' };
// The reference data (operators, data providers) is read again after a day.
const REFERENCE_MAX_AGE_MS = 24 * 3600000;
// Station devices created in a row are read together, once.
const CREATED_DEBOUNCE_MS = 10000;

/**
 * @description The message key and values of a failure.
 * @param {Error} err - An OcmError or a placement problem.
 * @param {string} label - The place, as the user knows it.
 * @returns {{ key: string, values: object }} The message.
 */
function problemOf(err, label) {
  switch (err.kind) {
    case 'house':
      return { key: 'statusHouseNotLocated', values: { house: label } };
    case 'coordinates':
      return { key: 'statusBadCoordinates', values: { value: label } };
    case 'no_key':
      return { key: 'noKey', values: {} };
    case 'bad_key':
      return { key: 'statusBadKey', values: {} };
    case 'blocked':
      return { key: 'statusBlocked', values: {} };
    case 'unreachable':
      return { key: 'statusUnreachable', values: {} };
    default:
      return { key: 'statusUnexpected', values: {} };
  }
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch implementation (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` between two requests (tests).
 * @param {number} [options.createdDebounceMs] - Wait after a device creation (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, getConfig: Function, places: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    sleep,
    createdDebounceMs = CREATED_DEBOUNCE_MS,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status sent, to send it again only when it changes.
  let lastStatus = null;
  // The places of the configuration, resolved: `{ id, slot, label, latitude,
  // longitude }`, and the problems of the others.
  let places = [];
  let placeProblems = [];
  let reference = EMPTY_REFERENCE;
  let referenceAt = null;
  let referenceLoading = null;
  let createdTimer = null;

  const userAgent = `${name}/${version} (+${homepage})`;
  const ocm = createOcmClient({ fetch: fetchImpl, userAgent, client: name });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  function textLanguage() {
    return config.language === AUTO_LANGUAGE ? language : config.language;
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  // --- Reference data ----------------------------------------------------------------

  /**
   * @description The reference data, read again after a day; a failure keeps
   * the last one (operator names are a comfort, not a need).
   * @param {boolean} [force] - Read now.
   * @returns {Promise<object>} The lookups.
   */
  async function getReference(force = false) {
    const fresh = referenceAt !== null && now() - referenceAt < REFERENCE_MAX_AGE_MS;
    if (!config.apiKey || (fresh && !force)) {
      return reference;
    }
    if (!referenceLoading) {
      referenceLoading = ocm
        .referenceData(config.apiKey)
        .then((raw) => {
          reference = readReferenceData(raw);
          referenceAt = now();
          logger.info(
            `Reference data: ${reference.operators.size} operators, ${reference.providers.size} data providers`,
          );
        })
        .catch((err) => {
          // Asked again at the next reading, not at once.
          referenceAt = now() - REFERENCE_MAX_AGE_MS + 3600000;
          logger.warn(`Unable to read the reference data: ${err.message}`);
        })
        .finally(() => {
          referenceLoading = null;
        });
    }
    await referenceLoading;
    return reference;
  }

  // --- Places ------------------------------------------------------------------------

  /**
   * @description Resolve every place of the configuration into a position. A
   * place that fails is kept in placeProblems.
   * @returns {Promise<void>}
   */
  async function resolvePlaces() {
    const resolved = [];
    const problems = [];
    let houses = null;
    for (const entry of config.places) {
      if (entry.typed) {
        if (!entry.coordinates) {
          problems.push({
            slot: entry.slot,
            label: entry.typed,
            error: Object.assign(new Error(`Not a position: ${entry.typed}`), {
              kind: 'coordinates',
            }),
          });
          continue;
        }
        const place = {
          id: placeId(entry),
          slot: entry.slot,
          typed: true,
          label: t('placeN', 'en', { n: entry.slot }),
          ...entry.coordinates,
        };
        if (!resolved.some((other) => other.id === place.id)) {
          resolved.push(place);
        }
        continue;
      }
      if (houses === null) {
        houses = await gladys.getHouses().catch((err) => {
          logger.warn(`Unable to read the houses: ${err.message}`);
          return [];
        });
      }
      const house = houses.find((candidate) => candidate.selector === entry.house);
      const label = house?.name ?? entry.house;
      if (!house || typeof house.latitude !== 'number' || typeof house.longitude !== 'number') {
        problems.push({
          slot: entry.slot,
          label,
          error: Object.assign(new Error(`House without a position: ${label}`), { kind: 'house' }),
        });
        continue;
      }
      const place = {
        id: placeId(entry),
        slot: entry.slot,
        label,
        latitude: house.latitude,
        longitude: house.longitude,
      };
      if (!resolved.some((other) => other.id === place.id)) {
        resolved.push(place);
      }
    }
    places = resolved;
    placeProblems = problems;
    logger.info(
      `Places: ${resolved.map((place) => `${place.label} (${place.latitude}, ${place.longitude})`).join('; ') || 'none'}`,
    );
  }

  // --- Devices and states --------------------------------------------------------------

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description The ids of the followed stations: the station devices the
   * user created.
   * @returns {number[]} Open Charge Map ids.
   */
  function followed() {
    return [...createdDevices]
      .map(targetOf)
      .filter((target) => target?.type === DEVICE_TYPES.STATION && /^\d+$/.test(target.id))
      .map((target) => Number(target.id));
  }

  /**
   * @description A station seen around a place, as a station snapshot.
   * @param {number} id - The station id.
   * @returns {object|null} `{ station, fetchedAt }` without check-ins.
   */
  function stationFromZones(id) {
    for (const zone of watcher.zones()) {
      const station = zone.stations.find((candidate) => candidate.id === id);
      if (station) {
        return { station, fetchedAt: zone.fetchedAt };
      }
    }
    return null;
  }

  /**
   * @description The best snapshot known of a station: the followed one (with
   * its check-ins), or the one of a zone.
   * @param {number} id - The station id.
   * @returns {object|null} The snapshot.
   */
  const stationSnapshot = (id) => watcher.station(id) ?? stationFromZones(id);

  /**
   * @description Publish the states of the created devices that changed (the
   * SDK remembers what it sent).
   * @param {object[]} zones - Zone snapshots.
   * @param {object[]} stations - Station snapshots.
   * @returns {Promise<void>}
   */
  async function publishStates(zones, stations) {
    const lang = textLanguage();
    const states = [
      ...zones
        .filter((snapshot) => isCreated(DEVICE_TYPES.ZONE, snapshot.place.id))
        .flatMap((snapshot) => buildZoneStates(gladys, snapshot, lang)),
      ...stations
        .filter((snapshot) => isCreated(DEVICE_TYPES.STATION, snapshot.station.id))
        .flatMap((snapshot) => buildStationStates(gladys, snapshot, lang)),
    ];
    if (states.length > 0) {
      await gladys.publishChangedStates(states);
    }
  }

  /**
   * @description Publish every state known, quietly.
   * @returns {Promise<void>}
   */
  const publishAll = () =>
    publishStates(watcher.zones(), followed().map(stationSnapshot).filter(Boolean)).catch((err) =>
      logger.warn(`Unable to publish the states: ${err.message}`),
    );

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`${data.device_name}: ${key}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The connection status after a round.
   * @param {object[]} zones - Zones read.
   * @param {object[]} failures - `{ label, error }` of what was not read.
   * @returns {Promise<void>}
   */
  async function reportRound(zones, failures) {
    if (!config.apiKey) {
      await reportStatus(false, all('noKey'));
      return;
    }
    if (config.places.length === 0) {
      await reportStatus(false, all('noPlace'));
      return;
    }
    if (failures.length === 0) {
      await reportStatus(true, all('statusConnected', { places: zones.length }));
      return;
    }
    const { key, values } = problemOf(failures[0].error, failures[0].label);
    if (zones.length === 0 || ['bad_key', 'no_key'].includes(failures[0].error.kind)) {
      await reportStatus(false, all(key, values));
      return;
    }
    const message = Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        t('statusPartial', lang, {
          places: zones.length,
          failed: failures.length,
          problem: t(key, lang, values),
        }),
      ]),
    );
    await reportStatus(true, message);
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    ocm,
    getKey: () => config.apiKey,
    getPlaces: async () => places,
    getFilters: () => config.filters,
    getFollowed: followed,
    getReference: () => getReference(),
    getIntervalMs: () => config.interval * 3600000,
    onRound: async ({ zones, stations, errors, partial }) => {
      const lang = textLanguage();
      for (const { snapshot, events } of zones) {
        for (const event of events) {
          await publishEvent(buildZoneEvent(gladys, snapshot, event, lang));
        }
      }
      for (const { snapshot, events } of stations) {
        for (const event of events) {
          await publishEvent(buildStationEvent(gladys, snapshot, event, lang));
        }
      }
      const changedZones = zones.filter((entry) => entry.changed).map((entry) => entry.snapshot);
      const changedStations = stations
        .filter((entry) => entry.changed)
        .map((entry) => entry.snapshot);
      // A followed station not read yet shows what its zone knows.
      const fromZones = followed()
        .filter((id) => !watcher.station(id))
        .map(stationFromZones)
        .filter(Boolean);
      await publishStates(changedZones, [...changedStations, ...fromZones]).catch((err) =>
        logger.warn(`Unable to publish the states: ${err.message}`),
      );
      refreshWidgets();
      if (!partial) {
        await reportRound(
          zones.map((entry) => entry.snapshot),
          [
            ...placeProblems,
            ...errors.map(({ place, error }) => ({ label: place?.label ?? '', error })),
          ],
        );
      }
    },
    now,
    sleep,
    logger,
  });

  /**
   * @description Offer every place, and the nearest stations of each, on the
   * Discovery screen (the followed stations stay offered).
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices() {
    const lang = textLanguage();
    const devices = [];
    const seen = new Set();
    const offerStation = (station) => {
      if (!seen.has(station.id)) {
        seen.add(station.id);
        devices.push(buildStationDevice(gladys, station, lang));
      }
    };
    for (const place of places) {
      devices.push(buildZoneDevice(gladys, place, lang));
    }
    for (const zone of watcher.zones()) {
      zone.stations.slice(0, config.offered).forEach(offerStation);
    }
    followed()
      .map(stationSnapshot)
      .filter(Boolean)
      .forEach((snapshot) => offerStation(snapshot.station));
    await gladys.publishDiscoveredDevices(devices);
    return devices.length;
  }

  /**
   * @description The zone a widget or a scene action targets: the chosen
   * device, or the first place.
   * @param {unknown} deviceExternalId - The `source: "devices"` value.
   * @returns {object|null} The zone snapshot, null when none is known.
   */
  function targetZone(deviceExternalId) {
    const target = targetOf(deviceExternalId);
    if (target?.type === DEVICE_TYPES.ZONE && watcher.zone(target.id)) {
      return watcher.zone(target.id);
    }
    return places.map((place) => watcher.zone(place.id)).find(Boolean) ?? null;
  }

  /**
   * @description The message of a widget when nothing can be shown yet.
   * @param {string} lang - The language.
   * @returns {object|null} The content, null when there is data to show.
   */
  function widgetProblem(lang) {
    if (!config.apiKey) {
      return messageContent(t('noKey', lang));
    }
    if (config.places.length === 0) {
      return messageContent(t('noPlace', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  // --- Dashboard widgets -------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.NEARBY, async ({ settings = {}, language: lang, units }) => {
    rememberLanguage(lang);
    const problem = widgetProblem(lang);
    if (problem) {
      return problem;
    }
    const snapshot = targetZone(settings.device);
    if (!snapshot) {
      const failed = placeProblems[0];
      if (failed) {
        const { key, values } = problemOf(failed.error, failed.label);
        return messageContent(t(key, lang, values));
      }
      return messageContent(t('placeNotRead', lang), 60);
    }
    return buildNearbyWidget({
      snapshot,
      language: lang,
      units,
      now: now(),
      pollHours: config.interval,
      settings: readNearbySettings(settings),
    });
  });

  gladys.onWidgetGet(WIDGETS.STATION, async ({ settings = {}, language: lang, units }) => {
    rememberLanguage(lang);
    const problem = widgetProblem(lang);
    if (problem) {
      return problem;
    }
    const target = targetOf(settings.device);
    const id = target?.type === DEVICE_TYPES.STATION ? Number(target.id) : followed()[0];
    const snapshot = Number.isInteger(id) ? stationSnapshot(id) : null;
    if (!snapshot) {
      return messageContent(t(Number.isInteger(id) ? 'stationNotRead' : 'chooseStation', lang), 60);
    }
    return buildStationWidget({ snapshot, language: lang, units, pollHours: config.interval });
  });

  // --- Scene action ------------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.FIND_STATION, async (fields = {}) => {
    const snapshot = targetZone(fields.device);
    if (!snapshot) {
      throw new Error('No place is configured, or none could be read yet');
    }
    // The stations of the last reading: they move slowly, and a scene run
    // often must not multiply the requests. No trigger fires here.
    return buildFindOutputs(snapshot, fields, textLanguage());
  });

  // --- Device commands ---------------------------------------------------------------
  gladys.onSetValue(async (device, deviceFeature) => {
    throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.CHECK, async () => {
    if (!config.apiKey) {
      return all('noKey');
    }
    if (config.places.length === 0) {
      return all('noPlace');
    }
    await resolvePlaces();
    await getReference(true);
    const lines = Object.fromEntries(LANGUAGES.map((lang) => [lang, []]));
    for (const place of places) {
      let line;
      try {
        const snapshot = await watcher.readZone(place);
        const up = inService(snapshot);
        line = (lang) =>
          t('testPlace', lang, {
            place: placeLabel(place, lang),
            position: `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`,
            count: snapshot.capped ? `${up.length}+` : up.length,
            fast: up.filter(isFast).length,
            radius: formatDistance(snapshot.radiusKm, lang),
          });
      } catch (err) {
        const { key, values } = problemOf(err, place.label);
        line = (lang) => `${placeLabel(place, lang)}: ${t(key, lang, values)}`;
      }
      for (const lang of LANGUAGES) {
        lines[lang].push(line(lang));
      }
    }
    for (const problem of placeProblems) {
      const { key, values } = problemOf(problem.error, problem.label);
      for (const lang of LANGUAGES) {
        lines[lang].push(t(key, lang, values));
      }
    }
    // The answers above are not a round: the timer keeps its pace, and the
    // devices show the next reading.
    return Object.fromEntries(LANGUAGES.map((lang) => [lang, lines[lang].join('\n')]));
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await resolvePlaces();
    await watcher.round();
    const count = await publishDiscoveredDevices();
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    const before = new Set(followed());
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishAll();
    refreshWidgets();
    if (followed().some((id) => !before.has(id) && !watcher.station(id))) {
      // A new station to follow: read the followed stations (check-ins
      // included) once, after the user added the others of the same batch.
      clearTimeout(createdTimer);
      createdTimer = setTimeout(() => {
        createdTimer = null;
        watcher.refreshStations();
      }, createdDebounceMs);
      createdTimer.unref?.();
    }
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Resolve the places, read Open Charge Map now and offer the
   * devices.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    await resolvePlaces();
    if (!config.apiKey) {
      await reportRound([], []);
      return;
    }
    await watcher.round();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousKey = config.apiKey;
    await loadConfig(rawConfig);
    if (config.apiKey !== previousKey) {
      referenceAt = null;
    }
    logger.info(`Configuration updated: Open Charge Map read every ${config.interval} h`);
    // A moved place or another search is a new baseline for its zone only
    // (the search signature changes); the timer keeps its pace.
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  gladys.on('connected', async () => {
    await loadConfig();
    await refreshCreatedDevices();
    lastStatus = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearTimeout(createdTimer);
    watcher.stop();
  });

  return { watcher, getConfig: () => config, places: () => places };
}

export { createApp, ACTIONS, SCENE_ACTIONS, REFERENCE_MAX_AGE_MS, problemOf };
