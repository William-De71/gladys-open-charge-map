import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOcmClient, nearbyQuery, stationsQuery, MAX_IDS } from '../src/ocm-api.js';
import { fakeWeb, KEY } from './helpers/fixtures.js';

test('the query around a point: km, compact, the filters only when set', () => {
  const plain = nearbyQuery({ latitude: 49.6116, longitude: 6.1319, radiusKm: 5 });
  assert.equal(plain.get('latitude'), '49.61160');
  assert.equal(plain.get('distanceunit'), 'km');
  assert.equal(plain.get('compact'), 'true');
  assert.equal(plain.get('verbose'), 'false');
  assert.equal(plain.has('minpowerkw'), false);
  assert.equal(plain.has('connectiontypeid'), false);
  const filtered = nearbyQuery({
    latitude: 49.6,
    longitude: 6.1,
    radiusKm: 20,
    minPowerKw: 50,
    connectionTypeIds: [33, 32],
  });
  assert.equal(filtered.get('minpowerkw'), '50');
  assert.equal(filtered.get('connectiontypeid'), '33,32');
  assert.equal(stationsQuery([1, 2]).get('includecomments'), 'true');
});

test('answers and errors become stations or an error kind', async () => {
  const fetch = fakeWeb();
  const ocm = createOcmClient({ fetch, userAgent: 'test/1.0' });
  const nearby = await ocm.nearby(KEY, { latitude: 49.6, longitude: 6.1, radiusKm: 5 });
  assert.equal(nearby.length, 29);
  assert.equal(fetch.calls[0].headers['User-Agent'], 'test/1.0');
  assert.deepEqual(await ocm.stations(KEY, []), [], 'no id, no request');
  assert.equal(fetch.calls.length, 1);
  const followed = await ocm.stations(KEY, [32022]);
  assert.equal(followed[0].UserComments.length, 4);
  const many = Array.from({ length: MAX_IDS + 20 }, (_, i) => i + 1);
  await ocm.stations(KEY, many);
  assert.equal(fetch.calls.at(-1).query.get('chargepointid').split(',').length, MAX_IDS);
  assert.equal((await ocm.referenceData(KEY)).Operators.length, 8);

  const kind = async (promise) => (await promise.catch((err) => err)).kind;
  assert.equal(await kind(ocm.nearby(null, { latitude: 1, longitude: 1, radiusKm: 1 })), 'no_key');
  assert.equal(
    await kind(ocm.nearby('wrong', { latitude: 1, longitude: 1, radiusKm: 1 })),
    'bad_key',
  );
  for (const [failure, expected] of [
    ['network', 'unreachable'],
    [429, 'blocked'],
    [503, 'unreachable'],
    [404, 'unexpected'],
  ]) {
    fetch.state.failure = failure;
    assert.equal(await kind(ocm.nearby(KEY, { latitude: 1, longitude: 1, radiusKm: 1 })), expected);
  }
});

test('an answer that is not a list of stations is unexpected', async () => {
  const answer = (body) => async () => new Response(body, { status: 200 });
  const kind = async (body) =>
    (
      await createOcmClient({ fetch: answer(body) })
        .nearby(KEY, { latitude: 1, longitude: 1, radiusKm: 1 })
        .catch((err) => err)
    ).kind;
  assert.equal(await kind('<html></html>'), 'unexpected');
  assert.equal(await kind('{"error":"x"}'), 'unexpected');
  const stations = await createOcmClient({ fetch: answer('[{"ID":1},null,{"x":2}]') }).nearby(KEY, {
    latitude: 1,
    longitude: 1,
    radiusKm: 1,
  });
  assert.deepEqual(stations, [{ ID: 1 }]);
});
