// -----------------------------------------------------------------------------
// Dashboard widgets of the Open Charge Map integration.
//
//   - `nearby`   the nearest stations of a place, with their status, power,
//                connectors, access and cost, filtered per widget (connector,
//                power, how many);
//   - `station`  one followed station: status, power, points, distance, the
//                last check-ins of drivers, and links to the map.
//
// The contents come from the snapshots of the last reading: a widget never
// costs a request to Open Charge Map. Every text exists in the four languages
// (the content is cached per language and unit system). The attribution the
// terms of Open Charge Map ask for (data provider and licence) is shown on
// both.
// -----------------------------------------------------------------------------

import { t, ago } from './i18n.js';
import { placeLabel, stationName, statusText, checkinText, inService } from './device.js';
import { isFast, connectorsText, addressText, matches, formatKw } from './stations.js';
import { formatDistance, formatDay } from './format.js';
import { GROUP_KEYS, OCM_PROVIDER } from './reference.js';

const WIDGETS = { NEARBY: 'nearby', STATION: 'station' };
const COUNTS = [3, 5, 8];
const DEFAULT_COUNT = 5;
const MIN_POWERS = [0, 7, 22, 50, 150];
const TTL = { min: 300, max: 3600, message: 300 };
const MAX_CHECKINS = 4;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long station name', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The settings of the `nearby` widget, unknown values replaced
 * by the defaults.
 * @param {object} [settings] - The raw settings.
 * @returns {{ connector: string, minPowerKw: number, count: number }} The settings.
 * @example
 * readNearbySettings({ connector: 'ccs', min_power: '50' });
 */
function readNearbySettings(settings = {}) {
  const minPowerKw = Number(settings.min_power);
  const count = Number(settings.count);
  return {
    connector: GROUP_KEYS.includes(settings.connector) ? settings.connector : 'any',
    minPowerKw: MIN_POWERS.includes(minPowerKw) ? minPowerKw : 0,
    count: COUNTS.includes(count) ? count : DEFAULT_COUNT,
  };
}

/**
 * @description The color of a status.
 * @param {object} station - The station.
 * @returns {string} A semantic color.
 */
function statusColor(station) {
  if (station.status === 'in_use') {
    return 'warning';
  }
  if (station.operational === true) {
    return 'success';
  }
  return station.operational === false ? 'danger' : 'neutral';
}

/**
 * @description The links of a station: its page on Open Charge Map, and the
 * way there on OpenStreetMap.
 * @param {object} station - The station.
 * @param {string} language - The language.
 * @returns {Array<{ url: string, label: string }>} The links.
 */
function linksOf(station, language) {
  const point = `${station.latitude.toFixed(5)},${station.longitude.toFixed(5)}`;
  return [
    { url: station.url, label: clip(t('linkDetails', language), 40) },
    {
      url: `https://www.openstreetmap.org/directions?to=${point}#map=17/${point.replace(',', '/')}`,
      label: clip(t('linkDirections', language), 40),
    },
  ];
}

/**
 * @description A data provider and its licence: "Open Charge Map (CC BY
 * 4.0)" for the community listings, "data.gouv.fr (Licence Ouverte)".
 * @param {object} provider - `{ id, title, license }`.
 * @returns {string} The provider.
 */
function providerText(provider) {
  const title = provider.id === OCM_PROVIDER.id ? 'Open Charge Map' : provider.title;
  return provider.license ? `${title} (${provider.license})` : title;
}

/**
 * @description The attribution of stations: the providers of the stations
 * shown, with their licence.
 * @param {object[]} stations - The stations.
 * @param {string} language - The language.
 * @returns {string} "Data: Open Charge Map (CC BY 4.0)".
 */
function attribution(stations, language) {
  const providers = [...new Set(stations.map((station) => providerText(station.provider)))];
  return t('attribution', language, { providers: providers.join(', ') });
}

/**
 * @description The card of a station.
 * @param {object} station - The station.
 * @param {string} language - The language.
 * @param {string} units - "metric" or "us".
 * @returns {object} The card-list item.
 */
function stationItem(station, language, units) {
  const details = [
    t('detailConnectors', language, { value: connectorsText(station, 8) || '?' }),
    t('detailAddress', language, { value: addressText(station) || '?' }),
    station.operator ? t('detailOperator', language, { value: station.operator }) : null,
    t('detailUsage', language, {
      value: [t(`usage_${station.usage}`, language), station.cost].filter(Boolean).join(' · '),
    }),
    station.access ? t('detailAccess', language, { value: station.access }) : null,
    station.checkins[0]
      ? t('detailCheckin', language, { value: checkinText(station.checkins[0], language) })
      : null,
    t('detailSource', language, { value: providerText(station.provider) }),
  ].filter(Boolean);
  return {
    title: clip(stationName(station), 60),
    subtitle: clip(
      [
        formatDistance(station.distanceKm, language, units),
        station.operator,
        station.maxPowerKw ? `${formatKw(station.maxPowerKw)} kW` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      80,
    ),
    badge: { text: clip(statusText(station, language), 16), color: statusColor(station) },
    description: clip(details.join('\n'), 2000),
    links: linksOf(station, language),
  };
}

/**
 * @description The `nearby` widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - The zone snapshot.
 * @param {string} options.language - The user language.
 * @param {string} [options.units] - "metric" or "us".
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollHours - The reading interval.
 * @param {object} [options.settings] - From readNearbySettings.
 * @returns {object} The content.
 * @example
 * buildNearbyWidget({ snapshot, language: 'fr', now: Date.now(), pollHours: 6 });
 */
function buildNearbyWidget({
  snapshot,
  language,
  units = 'metric',
  now,
  pollHours,
  settings = readNearbySettings(),
}) {
  const ttl = Math.min(TTL.max, Math.max(TTL.min, Math.round(pollHours * 3600)));
  const shown = snapshot.stations.filter((station) =>
    matches(station, {
      minPowerKw: settings.minPowerKw,
      groups: settings.connector === 'any' ? [] : [settings.connector],
    }),
  );
  const up = inService({ stations: shown });
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('readAgo', language, {
          place: placeLabel(snapshot.place, language),
          radius: formatDistance(snapshot.radiusKm, language, units),
          ago: ago(snapshot.fetchedAt, now, language),
        }),
        80,
      ),
    },
    {
      type: 'status',
      items: [
        {
          label: clip(t('rowInService', language), 40),
          value: clip(snapshot.capped ? `${up.length}+` : String(up.length), 40),
          color: up.length > 0 ? 'success' : 'neutral',
        },
        {
          label: clip(t('rowFast', language), 40),
          value: up.filter(isFast).length,
          color: 'info',
        },
        ...(up[0]
          ? [
              {
                label: clip(t('rowNearest', language), 40),
                value: clip(formatDistance(up[0].distanceKm, language, units), 40),
                color: 'primary',
              },
            ]
          : []),
      ],
    },
  ];
  if (shown.length > 0) {
    const listed = shown.slice(0, settings.count);
    components.push({
      type: 'card-list',
      display: 'list',
      items: listed.map((station) => stationItem(station, language, units)),
    });
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(attribution(listed, language), 80),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: clip(
        t('noStationBody', language, {
          radius: formatDistance(snapshot.radiusKm, language, units),
        }),
        300,
      ),
    });
  }
  return { ttl_seconds: ttl, components };
}

/**
 * @description The card of a check-in.
 * @param {object} checkin - The check-in.
 * @param {string} language - The language.
 * @returns {object} The card-list item.
 */
function checkinItem(checkin, language) {
  const colors = { success: 'success', failure: 'danger', other: 'neutral' };
  return {
    title: clip(
      checkin.kind ? t(`checkin_${checkin.kind}`, language) : t('checkinComment', language),
      60,
    ),
    subtitle: clip([formatDay(checkin.at, language), checkin.user].filter(Boolean).join(' · '), 80),
    badge: {
      text: clip(t(`outcome_${checkin.outcome}`, language), 16),
      color: colors[checkin.outcome],
    },
    ...(checkin.comment ? { description: clip(checkin.comment, 2000) } : {}),
  };
}

/**
 * @description The `station` widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - The station snapshot.
 * @param {string} options.language - The user language.
 * @param {string} [options.units] - "metric" or "us".
 * @param {number} options.pollHours - The reading interval.
 * @returns {object} The content.
 */
function buildStationWidget({ snapshot, language, units = 'metric', pollHours }) {
  const ttl = Math.min(TTL.max, Math.max(TTL.min, Math.round(pollHours * 3600)));
  const { station } = snapshot;
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(addressText(station) || stationName(station), 80),
    },
    {
      type: 'value',
      value: station.maxPowerKw ?? '?',
      unit: 'kW',
      label: clip(t('tilePower', language), 24),
      icon: 'zap',
    },
    {
      type: 'value',
      value: station.points,
      label: clip(t('tilePoints', language), 24),
      icon: 'battery-charging',
    },
    {
      type: 'value',
      value: clip(formatDistance(station.distanceKm, language, units), 12),
      label: clip(t('tileDistance', language), 24),
      icon: 'map-pin',
    },
    {
      type: 'status',
      items: [
        {
          label: clip(t('rowStatus', language), 40),
          value: clip(statusText(station, language), 40),
          color: statusColor(station),
        },
        {
          label: clip(t('rowConnectors', language), 40),
          value: clip(connectorsText(station, 2) || '?', 40),
          color: 'info',
        },
        {
          label: clip(t('rowUsage', language), 40),
          value: clip(station.cost ?? t(`usage_${station.usage}`, language), 40),
          color: station.isPublic ? 'success' : 'warning',
        },
        {
          label: clip(t('rowVerified', language), 40),
          value: clip(formatDay(station.verifiedAt ?? station.statusAt, language), 40),
          color: 'neutral',
        },
        // The attribution the terms of Open Charge Map ask for.
        {
          label: clip(t('rowSource', language), 40),
          value: clip(providerText(station.provider), 40),
          color: 'neutral',
        },
      ],
    },
  ];
  if (station.checkins.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: station.checkins
        .slice(0, MAX_CHECKINS)
        .map((checkin) => checkinItem(checkin, language)),
    });
  }
  for (const link of linksOf(station, language)) {
    components.push({
      type: 'button',
      label: clip(link.label, 24),
      icon: link.url === station.url ? 'external-link' : 'navigation',
      style: 'secondary',
      link: { url: link.url },
    });
  }
  return { ttl_seconds: ttl, components };
}

export {
  WIDGETS,
  COUNTS,
  DEFAULT_COUNT,
  MIN_POWERS,
  clip,
  messageContent,
  readNearbySettings,
  statusColor,
  linksOf,
  providerText,
  attribution,
  stationItem,
  buildNearbyWidget,
  checkinItem,
  buildStationWidget,
};
