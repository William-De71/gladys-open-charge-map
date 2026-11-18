// -----------------------------------------------------------------------------
// Scene events and scene action outputs of the integration.
//
// The tracker says what happened; this module writes the flat `data` of the
// event the core matches against the scene triggers. Every event carries:
//   - `device`       the device external id: the value of the "Device"
//                    filter (a `source: "devices"` select);
//   - `device_name`  the name of the zone or the station, readable by the actions;
//   - `summary`      a sentence ready to put in a message;
// plus the fields of its kind. Values are scalars (null when Open Charge Map
// did not say), texts cut at 1,000 characters.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS } from './tracker.js';
import {
  DEVICE_TYPES,
  idsOf,
  placeLabel,
  zoneName,
  stationName,
  statusText,
  checkinText,
} from './device.js';
import { isFast, connectorsText, addressText, matches, formatKw } from './stations.js';
import { formatDistance, iso, roundKm } from './format.js';
import { t } from './i18n.js';
import { GROUP_KEYS } from './reference.js';

const MAX_TEXT = 1000;
const clip = (value) => String(value ?? '').slice(0, MAX_TEXT);

/**
 * @description The values of a station, shared by the events and the action.
 * @param {object} station - The station.
 * @returns {object} Flat values.
 */
function stationValues(station) {
  return {
    station_id: station.id,
    station_name: clip(stationName(station)),
    address: clip(addressText(station)),
    distance_km: roundKm(station.distanceKm),
    max_power_kw: station.maxPowerKw,
    connectors: clip(connectorsText(station, 10)),
    operator: station.operator ? clip(station.operator) : null,
    status: station.status,
    latitude: station.latitude,
    longitude: station.longitude,
    url: station.url,
  };
}

/**
 * @description "Lidl (Mâcon), 0,8 km, 50 kW".
 * @param {object} station - The station.
 * @param {string} language - The language.
 * @returns {string} The station in a few words.
 */
function stationShort(station, language) {
  return [
    stationName(station),
    Number.isFinite(station.distanceKm) ? formatDistance(station.distanceKm, language) : null,
    station.maxPowerKw ? `${formatKw(station.maxPowerKw)} kW` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * @description The event of a new station around a place.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The zone snapshot.
 * @param {object} event - From diffZone.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function buildZoneEvent(gladys, snapshot, event, language) {
  const name = zoneName(snapshot.place, language);
  const { station } = event;
  return {
    key: event.key,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.ZONE, snapshot.place.id).device,
      device_name: clip(name),
      ...stationValues(station),
      fast: isFast(station) ? 'yes' : 'no',
      summary: clip(
        t('summaryNewStation', language, {
          place: placeLabel(snapshot.place, language),
          station: stationShort(station, language),
        }),
      ),
    },
  };
}

/**
 * @description The event of a followed station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The station snapshot.
 * @param {object} event - From diffStation.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function buildStationEvent(gladys, snapshot, event, language) {
  const { station } = snapshot;
  const name = stationName(station);
  const data = {
    device: idsOf(gladys, DEVICE_TYPES.STATION, station.id).device,
    device_name: clip(name),
    station_id: station.id,
    station_name: clip(name),
  };
  switch (event.key) {
    case SCENE_TRIGGERS.STATION_STATUS_CHANGED:
      Object.assign(data, {
        status: station.status,
        previous_status: event.previous,
        change: event.change,
        operational: station.operational,
        summary: clip(
          t('summaryStatus', language, {
            name,
            status: statusText(station, language),
            previous: t(`status_${event.previous}`, language),
          }),
        ),
      });
      break;
    case SCENE_TRIGGERS.NEW_CHECKIN: {
      const { checkin } = event;
      Object.assign(data, {
        outcome: checkin.outcome,
        kind: checkin.kind ?? 'comment',
        comment: clip(checkin.comment ?? ''),
        user_name: clip(checkin.user ?? ''),
        rating: checkin.rating,
        checked_at: iso(checkin.at),
        summary: clip(
          t('summaryCheckin', language, { name, checkin: checkinText(checkin, language) }),
        ),
      });
      break;
    }
    default:
      throw new Error(`Unknown station event: ${event.key}`);
  }
  return { key: event.key, data };
}

/**
 * @description Read the fields of the find_station scene action.
 * @param {object} [fields] - The raw fields.
 * @returns {{ groups: string[], minPowerKw: number, inServiceOnly: boolean }} The filters.
 */
function readFindFields(fields = {}) {
  const minPowerKw = Number(fields.min_power);
  return {
    groups: GROUP_KEYS.includes(fields.connector) ? [fields.connector] : [],
    minPowerKw: Number.isFinite(minPowerKw) && minPowerKw > 0 ? minPowerKw : 0,
    inServiceOnly: fields.in_service_only !== false && fields.in_service_only !== 'false',
  };
}

/**
 * @description The outputs of the find_station scene action: the nearest
 * station of a zone matching the fields. Texts Open Charge Map did not give
 * are empty, numbers 0 (outputs are typed).
 * @param {object} snapshot - The zone snapshot.
 * @param {object} rawFields - The fields of the action.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function buildFindOutputs(snapshot, rawFields, language) {
  const fields = readFindFields(rawFields);
  const found = snapshot.stations.filter(
    (station) =>
      (!fields.inServiceOnly || station.operational !== false) &&
      matches(station, { minPowerKw: fields.minPowerKw, groups: fields.groups }),
  );
  const station = found[0];
  if (!station) {
    return {
      found: false,
      count: 0,
      station_id: 0,
      name: '',
      address: '',
      distance_km: 0,
      max_power_kw: 0,
      connectors: '',
      operator: '',
      status: '',
      latitude: 0,
      longitude: 0,
      url: '',
      summary: clip(
        t('summaryFindNone', language, {
          place: placeLabel(snapshot.place, language),
          radius: formatDistance(snapshot.radiusKm, language),
        }),
      ),
    };
  }
  const values = stationValues(station);
  return {
    found: true,
    count: found.length,
    station_id: station.id,
    name: values.station_name,
    address: values.address,
    distance_km: values.distance_km ?? 0,
    max_power_kw: values.max_power_kw ?? 0,
    connectors: values.connectors,
    operator: values.operator ?? '',
    status: station.status,
    latitude: station.latitude,
    longitude: station.longitude,
    url: station.url,
    summary: clip(
      t('summaryFind', language, {
        station: stationShort(station, language),
        status: statusText(station, language),
        address: addressText(station) || '?',
      }),
    ),
  };
}

export {
  stationValues,
  stationShort,
  buildZoneEvent,
  buildStationEvent,
  readFindFields,
  buildFindOutputs,
};
