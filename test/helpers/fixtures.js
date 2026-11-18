// Answers of the Open Charge Map API, a fake of it behind one fetch, and a
// stand-in for the SDK external ids.
//
// The stations are real ones around Luxembourg City (29 stations within
// 6.2 km of 49.6116, 6.1319), taken from the public export of Open Charge Map
// (github.com/openchargemap/ocm-export, April 2026, compact form, the same
// as the API answers with compact=true&verbose=false), Open Charge Map
// Contributors, CC BY 4.0. The zone answer has no UserComments (the API sends
// them only with includecomments=true); the followed one has them.

import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

export const NEARBY = read('ocm-nearby-luxembourg.json');
export const FOLLOWED = read('ocm-followed-luxembourg.json');
export const REFERENCE = read('ocm-referencedata.json');

export const NOW = Date.parse('2026-11-17T18:00:00Z');
export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const KEY = 'test-key-0000';

export const HOUSE = {
  id: 'h1',
  name: 'Maison',
  selector: 'maison',
  latitude: 49.6116,
  longitude: 6.1319,
};

// A station with its check-ins, and a station close to the house.
export const BELLE_ETOILE = 32022;
export const TOUR_JACOB = 84030;

/**
 * @description A copy of a raw station, with changes.
 * @param {number} id - The station id (in NEARBY or FOLLOWED).
 * @param {object} [changes] - Fields to replace.
 * @returns {object} The raw station.
 */
export function rawStation(id, changes = {}) {
  const raw = [...FOLLOWED, ...NEARBY].find((entry) => entry.ID === id);
  return { ...structuredClone(raw), ...changes };
}

/**
 * @description A raw check-in.
 * @param {object} [options] - Overrides.
 * @returns {object} The UserComment.
 */
export function rawCheckin({
  id = 900001,
  status = 25,
  comment = 'Card reader broken',
  user = 'Ana',
  date = '2026-11-17T08:00:00Z',
  type = 10,
} = {}) {
  return {
    ID: id,
    ChargePointID: BELLE_ETOILE,
    CommentTypeID: type,
    UserName: user,
    Comment: comment,
    DateCreated: date,
    CheckinStatusTypeID: status,
  };
}

/**
 * @description A fake of the Open Charge Map API, from an editable state.
 * Records every call in `fetch.calls`.
 * @param {object} [state] - `{ nearby, stations, reference, failure, key }`:
 * `nearby` answers every /poi around a point, `stations` (id -> raw) every
 * /poi by id.
 * @returns {Function} The fetch, with `.state` and `.calls`.
 */
export function fakeWeb(state = {}) {
  const web = {
    nearby: structuredClone(NEARBY),
    // The followed stations (last) come with their check-ins.
    stations: Object.fromEntries(
      [...NEARBY, ...FOLLOWED].map((raw) => [raw.ID, structuredClone(raw)]),
    ),
    reference: REFERENCE,
    failure: null,
    key: KEY,
    ...state,
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetch = async (url, init = {}) => {
    const { hostname, pathname, searchParams } = new URL(url);
    fetch.calls.push({
      host: hostname,
      path: pathname,
      query: searchParams,
      headers: init.headers,
    });
    if (hostname !== 'api.openchargemap.io') {
      return json({ message: 'not found' }, 404);
    }
    if (web.failure === 'network') {
      throw new TypeError('fetch failed');
    }
    if (typeof web.failure === 'number') {
      return new Response('Error', { status: web.failure });
    }
    if (init.headers?.['X-API-Key'] !== web.key) {
      return new Response(
        'You must specify an API key using the key query parameter or x-api-key header.',
        { status: 403 },
      );
    }
    if (pathname === '/v3/referencedata') {
      return json(web.reference);
    }
    if (pathname === '/v3/poi') {
      if (searchParams.has('chargepointid')) {
        const ids = searchParams.get('chargepointid').split(',').map(Number);
        return json(ids.map((id) => web.stations[id]).filter(Boolean));
      }
      const withComments = searchParams.get('includecomments') === 'true';
      return json(
        web.nearby.map((raw) => {
          const copy = { ...raw };
          if (!withComments) {
            delete copy.UserComments;
          }
          return copy;
        }),
      );
    }
    return json({ message: 'not found' }, 404);
  };
  fetch.calls = [];
  fetch.state = web;
  return fetch;
}

// The SDK external ids, without a client (selector `open-charge-map`).
export const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:open-charge-map:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export const silent = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
export const noSleep = async () => {};
