// -----------------------------------------------------------------------------
// Configuration of the Open Charge Map integration.
//
// Fields of the config_schema:
//   - `api_key`          the personal key of the Open Charge Map API (secret);
// per place (`<n>` from 1 to 3):
//   - `house_<n>`        a house of Gladys (`source: "houses"`): its position;
//   - `coordinates_<n>`  or a position typed by hand, "46.3069, 4.8325" (it
//                        wins over the house);
// the search, the same for every place:
//   - `radius`           km around a place;
//   - `min_power`        minimum power of a connector, kW (0: any);
//   - `connectors`       connector groups (empty: any);
//   - `public_only`      leave out the private stations (true by default);
//   - `offered`          nearest stations offered as devices, per place;
// and:
//   - `interval`         hours between two readings;
//   - `language`         language of the texts Gladys does not ask for in a
//                        language (device names, scene summaries): `auto`
//                        follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`    language of the last widget request, kept for the
//                        texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { GROUP_KEYS } from './reference.js';

const MAX_PLACES = 3;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const RADII = [1, 2, 5, 10, 20, 50];
const DEFAULT_RADIUS = 5;
const MIN_POWERS = [0, 7, 11, 22, 50, 150];
const OFFERED = [5, 10, 20, 50];
const DEFAULT_OFFERED = 10;
// Hours. Stations change slowly and the fair usage policy of Open Charge Map
// asks not to repeat queries: every 6 hours is 4 requests a day per place.
const INTERVALS = [1, 3, 6, 12, 24];
const DEFAULT_INTERVAL = 6;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');
const oneOf = (raw, values, fallback) => {
  const value = Number(raw);
  return values.includes(value) ? value : fallback;
};

/**
 * @description Read a position typed by hand: "46.3069, 4.8325",
 * "46.3069 4.8325", "46,3069; 4,8325".
 * @param {unknown} raw - The typed text.
 * @returns {{ latitude: number, longitude: number }|null} The position, null
 * when it is not one.
 * @example
 * readCoordinates('46.3069, 4.8325'); // -> { latitude: 46.3069, longitude: 4.8325 }
 */
function readCoordinates(raw) {
  let value = readString(raw).replace(/°/g, '');
  if (!value) {
    return null;
  }
  value = value.replace(/,\s+/g, ';');
  let parts;
  if (value.includes(';')) {
    parts = value.split(';');
  } else if (/\s/.test(value)) {
    parts = value.split(/\s+/);
  } else {
    parts = value.split(',');
  }
  if (parts.length !== 2) {
    return null;
  }
  const [latitude, longitude] = parts.map((part) => Number(part.trim().replace(',', '.')));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { latitude, longitude };
}

/**
 * @description Read the connector groups.
 * @param {unknown} raw - The multi_select value (an array), or a list as text.
 * @returns {string[]} Known groups, in the order of GROUP_KEYS.
 */
function readGroups(raw) {
  let values = raw;
  if (typeof raw === 'string') {
    try {
      values = JSON.parse(raw);
    } catch {
      values = raw.split(',');
    }
  }
  const chosen = new Set(Array.isArray(values) ? values.map((value) => String(value).trim()) : []);
  return GROUP_KEYS.filter((group) => chosen.has(group));
}

/**
 * @description Read a boolean that may come as a string.
 * @param {unknown} raw - The value.
 * @param {boolean} fallback - When unset.
 * @returns {boolean} The value.
 */
function readBoolean(raw, fallback) {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  return fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ apiKey, places: [{ slot, house, coordinates, typed }],
 * filters: { radiusKm, minPowerKw, groups, publicOnly }, offered, interval,
 * language }`; a slot without a house nor a position is left out.
 * @example
 * normalizeConfig({ api_key: 'k', house_1: 'maison' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const places = [];
  for (let slot = 1; slot <= MAX_PLACES; slot += 1) {
    const house = readString(config[`house_${slot}`]) || null;
    const typed = readString(config[`coordinates_${slot}`]) || null;
    if (house || typed) {
      places.push({ slot, house, typed, coordinates: readCoordinates(typed) });
    }
  }
  return {
    apiKey: readString(config.api_key) || null,
    places,
    filters: {
      radiusKm: oneOf(config.radius, RADII, DEFAULT_RADIUS),
      minPowerKw: oneOf(config.min_power, MIN_POWERS, 0),
      groups: readGroups(config.connectors),
      publicOnly: readBoolean(config.public_only, true),
    },
    offered: oneOf(config.offered, OFFERED, DEFAULT_OFFERED),
    interval: oneOf(config.interval, INTERVALS, DEFAULT_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_PLACES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  RADII,
  DEFAULT_RADIUS,
  MIN_POWERS,
  OFFERED,
  DEFAULT_OFFERED,
  INTERVALS,
  DEFAULT_INTERVAL,
  readCoordinates,
  readGroups,
  normalizeConfig,
  readLanguage,
};
