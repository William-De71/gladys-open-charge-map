import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { SCENE_TRIGGERS } from '../src/tracker.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, COUNTS, DEFAULT_COUNT, MIN_POWERS as WIDGET_POWERS } from '../src/widgets.js';
import {
  INTERVALS,
  DEFAULT_INTERVAL,
  RADII,
  DEFAULT_RADIUS,
  MIN_POWERS,
  OFFERED,
  DEFAULT_OFFERED,
  AUTO_LANGUAGE,
  MAX_PLACES,
} from '../src/config.js';
import { GROUP_KEYS, OUTCOMES } from '../src/reference.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-open-charge-map:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-open-charge-map/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
});

test('declares the cloud transport only: Open Charge Map has no local API', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/ocm-api.js'), /https:\/\/api\.openchargemap\.io\/v3/);
});

test('requires Gladys 5.3.0 (house selector, catalog fields); location only as extra permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['vehicles', 'transport']);
  assert.equal(manifest.location, true, 'the houses and their coordinates');
  for (const key of ['network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  assert.match(app, /onAction\(ACTIONS\.CHECK/);
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('api_key').type, 'secret');
  assert.deepEqual(values(config.get('interval')).map(Number), INTERVALS);
  assert.equal(Number(config.get('interval').default), DEFAULT_INTERVAL);
  assert.deepEqual(values(config.get('radius')).map(Number), RADII);
  assert.equal(Number(config.get('radius').default), DEFAULT_RADIUS);
  assert.deepEqual(values(config.get('min_power')).map(Number), MIN_POWERS);
  assert.deepEqual(values(config.get('offered')).map(Number), OFFERED);
  assert.equal(Number(config.get('offered').default), DEFAULT_OFFERED);
  assert.equal(config.get('connectors').type, 'multi_select');
  assert.deepEqual(values(config.get('connectors')), GROUP_KEYS);
  assert.equal(config.get('public_only').default, true);
  for (let slot = 1; slot <= MAX_PLACES; slot += 1) {
    assert.equal(config.get(`house_${slot}`).source, 'houses');
    assert.equal(config.get(`coordinates_${slot}`).type, 'string');
  }
  assert.equal(config.get(`house_${MAX_PLACES + 1}`), undefined);

  const nearby = byKey(byKey(manifest.widgets).get(WIDGETS.NEARBY).settings);
  assert.deepEqual(values(nearby.get('connector')), ['any', ...GROUP_KEYS]);
  assert.deepEqual(values(nearby.get('min_power')).map(Number), WIDGET_POWERS);
  assert.deepEqual(values(nearby.get('count')).map(Number), COUNTS);
  assert.equal(Number(nearby.get('count').default), DEFAULT_COUNT);

  const triggers = byKey(manifest.scene_triggers);
  const fields = (key) => byKey(triggers.get(key).fields);
  assert.deepEqual(values(fields('new_station').get('fast')), ['yes', 'no']);
  assert.deepEqual(values(fields('station_status_changed').get('change')), [
    'unavailable',
    'available',
    'other',
  ]);
  assert.deepEqual(values(fields('new_checkin').get('outcome')), OUTCOMES);
  const find = byKey(manifest.scene_actions[0].fields);
  assert.deepEqual(values(find.get('connector')), GROUP_KEYS);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok(trigger.fields.length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120);
    assert.ok(action.fields.length <= 10 && action.outputs.length <= 20, action.key);
  }
  for (const widget of manifest.widgets) {
    assert.ok(widget.settings.length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  // The store refuses a manifest of 100 KB or more.
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  // The cover: 800 x 534 JPEG under 150 KB (dimensions checked by the store).
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog fields of Gladys 5.3: search keywords, worldwide', () => {
  assert.ok(Array.isArray(manifest.keywords), 'keywords is a list');
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10, '1 to 10 keywords');
  for (const keyword of manifest.keywords) {
    assert.ok(
      keyword.trim().length >= 2 && keyword.trim().length <= 30,
      `"${keyword}": 2 to 30 chars`,
    );
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords are unique');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'the name is already searched');
  // Open Charge Map covers the whole world.
  assert.equal(manifest.countries, undefined);
});
