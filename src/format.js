// -----------------------------------------------------------------------------
// Numbers, distances and dates for the texts, in the user's language.
//
// Dates follow the time zone of the container (TZ, set by the Gladys
// supervisor), distances the unit system of the widget request ("metric" or
// "us"); the device features and the scene values stay in km.
// -----------------------------------------------------------------------------

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const KM_PER_MILE = 1.609344;

const locale = (language) => LOCALES[language] ?? LOCALES.en;

/**
 * @description A number with at most `digits` decimals, in the language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} [digits] - Decimals at most.
 * @returns {string} "1,5" in French.
 * @example
 * formatNumber(1.5, 'fr'); // -> '1,5'
 */
function formatNumber(value, language, digits = 1) {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);
}

/**
 * @description A distance: one decimal under 10, none above.
 * @param {number|null} km - The distance in km.
 * @param {string} language - The language.
 * @param {string} [units] - "metric" or "us".
 * @returns {string} "0,8 km", "12 km", "7.5 mi"; "?" when unknown.
 * @example
 * formatDistance(0.83, 'fr'); // -> '0,8 km'
 */
function formatDistance(km, language, units = 'metric') {
  if (!Number.isFinite(km)) {
    return '?';
  }
  const us = units === 'us';
  const value = us ? km / KM_PER_MILE : km;
  return `${formatNumber(value, language, value < 10 ? 1 : 0)} ${us ? 'mi' : 'km'}`;
}

/**
 * @description A day, short: "12/11/2026" (en-GB, fr, es), "12.11.2026" (de).
 * @param {number|null} instant - The instant, in ms.
 * @param {string} language - The language.
 * @returns {string} The day; "?" when unknown.
 * @example
 * formatDay(Date.parse('2026-11-12T10:00:00Z'), 'fr'); // -> '12/11/2026'
 */
function formatDay(instant, language) {
  if (!Number.isFinite(instant)) {
    return '?';
  }
  // Not dateStyle "short": Spanish writes the year on two digits then.
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(instant);
}

/**
 * @description An instant in ISO 8601 (UTC), or null.
 * @param {number|null} instant - The instant, in ms.
 * @returns {string|null} The ISO text.
 */
const iso = (instant) => (Number.isFinite(instant) ? new Date(instant).toISOString() : null);

/**
 * @description A distance rounded for the scene values (km, 2 decimals).
 * @param {number|null} km - The distance.
 * @returns {number|null} The rounded distance.
 */
const roundKm = (km) => (Number.isFinite(km) ? Math.round(km * 100) / 100 : null);

export { KM_PER_MILE, formatNumber, formatDistance, formatDay, iso, roundKm };
