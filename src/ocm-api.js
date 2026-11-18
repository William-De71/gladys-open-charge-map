// -----------------------------------------------------------------------------
// Client of the Open Charge Map API (https://api.openchargemap.io/v3).
//
// Open Charge Map is the open registry of public charging stations, filled by
// its community and by imports of national registries. The API is free with
// a personal key (openchargemap.org > My profile > My apps), sent in the
// `X-API-Key` header. Its fair usage policy asks not to repeat the same query
// and to name the client: the integration sends a User-Agent and `client`,
// asks once per place and per reading (every 6 hours by default), and the
// reference data (operators, data providers) once a day.
//
//   GET /poi?latitude&longitude&distance&distanceunit=km&maxresults
//           &compact=true&verbose=false[&minpowerkw][&connectiontypeid]
//       the stations around a point, nearest first, reference data as ids;
//   GET /poi?chargepointid=1,2,3&includecomments=true&compact=true&verbose=false
//       the stations the user follows, with their check-ins;
//   GET /referencedata
//       operators, data providers (title and licence), countries.
//
// Answers recorded in November 2026: 403 with the text "You must specify an
// API key…" without a key; a JSON array of stations otherwise.
//
// Every failure becomes an OcmError with a `kind` the app turns into a user
// message: no_key, bad_key, blocked, unreachable, unexpected.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.openchargemap.io/v3';
const TIMEOUT_MS = 30000;
// The API answers 100 stations by default; a radius of 50 km around a city
// holds more. 250 stays a light answer in compact mode (~1 KB per station).
const MAX_RESULTS = 250;
// The ids of the followed stations travel in the query string.
const MAX_IDS = 100;

class OcmError extends Error {
  /**
   * @description An error of the Open Charge Map API.
   * @param {string} kind - no_key, bad_key, blocked, unreachable or unexpected.
   * @param {string} message - What failed.
   * @param {number} [status] - The HTTP status, when there was an answer.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'OcmError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The query of the stations around a point.
 * @param {object} options - Options.
 * @param {number} options.latitude - Latitude.
 * @param {number} options.longitude - Longitude.
 * @param {number} options.radiusKm - Search radius, in km.
 * @param {number} [options.minPowerKw] - Minimum power of a connector (0: any).
 * @param {number[]} [options.connectionTypeIds] - Connector types (empty: any).
 * @param {string} [options.client] - Name of the client.
 * @returns {URLSearchParams} The query.
 * @example
 * nearbyQuery({ latitude: 46.3, longitude: 4.83, radiusKm: 5 }).toString();
 */
function nearbyQuery({
  latitude,
  longitude,
  radiusKm,
  minPowerKw = 0,
  connectionTypeIds = [],
  client = 'gladys-open-charge-map',
}) {
  const query = new URLSearchParams({
    output: 'json',
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    distance: String(radiusKm),
    distanceunit: 'km',
    maxresults: String(MAX_RESULTS),
    compact: 'true',
    verbose: 'false',
    client,
  });
  if (minPowerKw > 0) {
    query.set('minpowerkw', String(minPowerKw));
  }
  if (connectionTypeIds.length > 0) {
    query.set('connectiontypeid', connectionTypeIds.join(','));
  }
  return query;
}

/**
 * @description The query of given stations, with their check-ins.
 * @param {number[]} ids - Station ids.
 * @param {string} [client] - Name of the client.
 * @returns {URLSearchParams} The query.
 * @example
 * stationsQuery([102103, 15290]).get('chargepointid'); // -> '102103,15290'
 */
function stationsQuery(ids, client = 'gladys-open-charge-map') {
  return new URLSearchParams({
    output: 'json',
    chargepointid: ids.join(','),
    maxresults: String(ids.length),
    includecomments: 'true',
    compact: 'true',
    verbose: 'false',
    client,
  });
}

/**
 * @description Create an Open Charge Map client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - fetch implementation (tests).
 * @param {string} [options.userAgent] - User-Agent header.
 * @param {string} [options.client] - The `client` query parameter.
 * @param {string} [options.baseUrl] - API root (tests).
 * @returns {{ nearby: Function, stations: Function, referenceData: Function }} The client.
 * @example
 * const ocm = createOcmClient({ userAgent: 'gladys-open-charge-map/0.1.0' });
 * const raw = await ocm.nearby(key, { latitude: 46.3, longitude: 4.83, radiusKm: 5 });
 */
function createOcmClient({
  fetch = globalThis.fetch,
  userAgent = 'gladys-open-charge-map',
  client = 'gladys-open-charge-map',
  baseUrl = BASE_URL,
} = {}) {
  /**
   * @description One GET of the API.
   * @param {string} key - The API key.
   * @param {string} path - The path ("/poi").
   * @param {URLSearchParams} [query] - The query.
   * @returns {Promise<unknown>} The JSON answer.
   */
  async function get(key, path, query) {
    const label = `Open Charge Map ${path}`;
    if (!key) {
      throw new OcmError('no_key', `${label}: no API key`);
    }
    let response;
    try {
      response = await fetch(`${baseUrl}${path}${query ? `?${query}` : ''}`, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent, 'X-API-Key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new OcmError(
        'unreachable',
        `${label}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`,
      );
    }
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      // The same 403 says "You must specify an API key" for a missing key and
      // an unknown one: both mean the key in the settings is not accepted.
      throw new OcmError('bad_key', `${label}: HTTP ${response.status}`, response.status);
    }
    if (response.status === 429) {
      throw new OcmError('blocked', `${label}: HTTP 429`, 429);
    }
    if (!response.ok) {
      throw new OcmError(
        response.status >= 500 ? 'unreachable' : 'unexpected',
        `${label}: HTTP ${response.status}`,
        response.status,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new OcmError('unexpected', `${label}: the answer is not JSON`, response.status);
    }
  }

  /**
   * @description A list of stations, or an error.
   * @param {unknown} body - The JSON answer.
   * @param {string} label - What was asked.
   * @returns {object[]} The raw stations.
   */
  function stationList(body, label) {
    if (!Array.isArray(body)) {
      throw new OcmError('unexpected', `${label}: not a list of stations`);
    }
    return body.filter((entry) => entry && typeof entry === 'object' && Number.isInteger(entry.ID));
  }

  return {
    /**
     * @description The stations around a point, nearest first.
     * @param {string} key - The API key.
     * @param {object} options - See nearbyQuery.
     * @returns {Promise<object[]>} Raw stations (compact).
     */
    nearby: async (key, options) =>
      stationList(await get(key, '/poi', nearbyQuery({ ...options, client })), 'nearby'),
    /**
     * @description Given stations, with their check-ins.
     * @param {string} key - The API key.
     * @param {number[]} ids - Station ids (MAX_IDS at most are asked).
     * @returns {Promise<object[]>} Raw stations (compact, with UserComments).
     */
    stations: async (key, ids) => {
      if (ids.length === 0) {
        return [];
      }
      return stationList(
        await get(key, '/poi', stationsQuery(ids.slice(0, MAX_IDS), client)),
        'stations',
      );
    },
    /**
     * @description The reference data (operators, data providers…).
     * @param {string} key - The API key.
     * @returns {Promise<object>} The raw reference data.
     */
    referenceData: async (key) => {
      const body = await get(key, '/referencedata');
      if (!body || typeof body !== 'object' || !Array.isArray(body.Operators)) {
        throw new OcmError('unexpected', 'Open Charge Map /referencedata: no operator list');
      }
      return body;
    },
  };
}

export { BASE_URL, MAX_RESULTS, MAX_IDS, OcmError, nearbyQuery, stationsQuery, createOcmClient };
