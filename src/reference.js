// -----------------------------------------------------------------------------
// Reference data of Open Charge Map.
//
// In compact mode the API gives ids in place of the reference objects. The
// small lists that never move (station status, usage, check-in kinds,
// connector types) are written here, to translate them and to work before
// the first /referencedata answer; the long ones (968 operators, 49 data
// providers with their licence) come from /referencedata, read once a day
// (see app.js). Ids and titles recorded from /referencedata in November 2026.
// -----------------------------------------------------------------------------

/**
 * Station status (StatusTypeID). `connector` is the value of the Gladys
 * feature charging-station / connector-status (0 available, 1 occupied,
 * 2 reserved, 3 unavailable, 4 faulted), null when unknown. Open Charge Map
 * rarely knows the live occupancy: "operational" means "in service", and is
 * shown as available.
 */
const STATUSES = {
  0: { key: 'unknown', operational: null, connector: null },
  10: { key: 'available', operational: true, connector: 0 },
  20: { key: 'in_use', operational: true, connector: 1 },
  30: { key: 'temporarily_unavailable', operational: false, connector: 3 },
  50: { key: 'operational', operational: true, connector: 0 },
  75: { key: 'partly_operational', operational: true, connector: 0 },
  100: { key: 'not_operational', operational: false, connector: 4 },
  150: { key: 'planned', operational: false, connector: 3 },
  200: { key: 'removed', operational: false, connector: 3 },
  210: { key: 'removed', operational: false, connector: 3 },
};
const STATUS_KEYS = [...new Set(Object.values(STATUSES).map((status) => status.key))];
// Never listed, never counted: gone, or a duplicate of another listing.
const HIDDEN_STATUSES = new Set([200, 210]);

/** Usage (UsageTypeID): who may charge. */
const USAGES = {
  0: 'unknown',
  1: 'public',
  4: 'membership',
  5: 'pay_at_location',
  7: 'notice',
  2: 'private',
  3: 'private',
  6: 'customers',
};
const PRIVATE_USAGES = new Set(['private', 'customers']);

/**
 * Check-in kinds (CheckinStatusTypeID) and their outcome for the scene
 * trigger filter: success, failure or other.
 */
const CHECKINS = {
  0: { key: 'not_visited', outcome: 'other' },
  10: { key: 'charged', outcome: 'success' },
  15: { key: 'charged_auto', outcome: 'success' },
  20: { key: 'failed_not_operational', outcome: 'failure' },
  22: { key: 'failed_not_installed', outcome: 'failure' },
  25: { key: 'failed_problem', outcome: 'failure' },
  30: { key: 'failed_not_compatible', outcome: 'failure' },
  40: { key: 'failed_access_card', outcome: 'failure' },
  50: { key: 'failed_no_equipment', outcome: 'failure' },
  100: { key: 'in_use_ev', outcome: 'other' },
  110: { key: 'in_use_ice', outcome: 'failure' },
  120: { key: 'not_accessible', outcome: 'failure' },
  130: { key: 'not_found', outcome: 'failure' },
  140: { key: 'confirmed', outcome: 'success' },
  150: { key: 'duplicate', outcome: 'other' },
  160: { key: 'decommissioned', outcome: 'failure' },
  200: { key: 'other_bad', outcome: 'failure' },
  210: { key: 'other_good', outcome: 'success' },
};
const OUTCOMES = ['success', 'failure', 'other'];
// A comment without a check-in, of the kind "fault report", is a failure.
const FAULT_REPORT_COMMENT = 1000;

/**
 * Connector groups of the settings and of the filters, and the connector
 * types (ConnectionTypeID) of each.
 */
const CONNECTOR_GROUPS = {
  type2: [25, 1036],
  ccs: [33, 32],
  chademo: [2, 1044],
  type1: [1, 7],
  tesla: [27, 30, 8],
  domestic: [28, 23, 13, 3, 16, 22, 9, 10, 11, 14, 15, 1037, 29, 1043, 1042],
};
const GROUP_KEYS = Object.keys(CONNECTOR_GROUPS);

/** Short names of the connector types, as drivers know them. */
const CONNECTION_TYPES = {
  0: '?',
  1: 'Type 1',
  2: 'CHAdeMO',
  3: 'BS1363',
  4: 'Blue Commando',
  5: 'LP Inductive',
  6: 'SP Inductive',
  7: 'Avcon',
  8: 'Tesla Roadster',
  9: 'NEMA 5-20',
  10: 'NEMA 14-30',
  11: 'NEMA 14-50',
  13: 'Europlug',
  14: 'NEMA 6-20',
  15: 'NEMA 6-15',
  16: 'CEE 3 pin',
  17: 'CEE 5 pin',
  18: 'CEE+ 7 pin',
  21: 'XLR',
  22: 'NEMA 5-15',
  23: 'CEE 7/5',
  24: 'Wireless',
  25: 'Type 2',
  26: 'Type 3C',
  27: 'NACS',
  28: 'Schuko',
  29: 'Type I',
  30: 'Tesla S/X',
  31: 'Tesla swap',
  32: 'CCS1',
  33: 'CCS2',
  34: 'IEC 60309 3p',
  35: 'IEC 60309 5p',
  36: 'Type 3A',
  1036: 'Type 2 cable',
  1037: 'Type J',
  1038: 'GB/T AC',
  1039: 'GB/T AC cable',
  1040: 'GB/T DC',
  1041: 'AS/NZS 3123',
  1042: 'NEMA TT-30',
  1043: 'Type M',
  1044: 'ChaoJi',
};

// The data provider of the community listings, known before /referencedata.
const OCM_PROVIDER = {
  id: 1,
  title: 'Open Charge Map Contributors',
  license: 'CC BY 4.0',
};

/**
 * @description The connector group of a connector type.
 * @param {number} typeId - ConnectionTypeID.
 * @returns {string} A GROUP_KEYS value, or "other".
 * @example
 * groupOf(33); // -> 'ccs'
 */
function groupOf(typeId) {
  return GROUP_KEYS.find((group) => CONNECTOR_GROUPS[group].includes(typeId)) ?? 'other';
}

/**
 * @description The connector types of groups.
 * @param {string[]} groups - GROUP_KEYS values.
 * @returns {number[]} The ConnectionTypeIDs.
 * @example
 * typesOf(['type2']); // -> [25, 1036]
 */
function typesOf(groups) {
  return groups.flatMap((group) => CONNECTOR_GROUPS[group] ?? []);
}

/**
 * @description A short licence name ("CC BY 4.0") from the licence text of a
 * data provider; the text itself when no known licence is named.
 * @param {string|null} text - The License field.
 * @returns {string} The licence, possibly empty.
 * @example
 * licenseName('Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)'); // -> 'CC BY 4.0'
 */
function licenseName(text) {
  const value = String(text ?? '').trim();
  const known = [
    [/\bCC[- ]?BY[- ]?SA[- ]?4/i, 'CC BY-SA 4.0'],
    [/\bCC[- ]?BY[- ]?4|Attribution 4\.0/i, 'CC BY 4.0'],
    [/\bCC[- ]?BY[- ]?3|creativecommons\.org\/licenses\/by\/3\.0/i, 'CC BY 3.0'],
    [/NonCommercial-ShareAlike|BY-NC-SA/i, 'CC BY-NC-SA'],
    [/\bCC[- ]?0\b|CC0/i, 'CC0'],
    [/etalab|Licence Ouverte|Open License/i, 'Licence Ouverte'],
    [/Open Government Licence|public sector information/i, 'OGL'],
    [/\bCC-BY\b/i, 'CC BY'],
  ];
  const found = known.find(([pattern]) => pattern.test(value));
  if (found) {
    return found[1];
  }
  return value.length > 60 ? `${value.slice(0, 59)}…` : value;
}

/**
 * @description The lookups of a /referencedata answer the integration uses.
 * @param {object} [raw] - The raw reference data.
 * @returns {{ operators: Map<number, string>, providers: Map<number, object> }} The lookups.
 * @example
 * const reference = readReferenceData(await ocm.referenceData(key));
 */
function readReferenceData(raw) {
  const operators = new Map();
  for (const operator of raw?.Operators ?? []) {
    if (Number.isInteger(operator?.ID) && typeof operator.Title === 'string') {
      operators.set(operator.ID, operator.Title.trim());
    }
  }
  const providers = new Map([[OCM_PROVIDER.id, OCM_PROVIDER]]);
  for (const provider of raw?.DataProviders ?? []) {
    if (Number.isInteger(provider?.ID) && typeof provider.Title === 'string') {
      providers.set(provider.ID, {
        id: provider.ID,
        title: provider.Title.trim(),
        license: licenseName(provider.License),
      });
    }
  }
  return { operators, providers };
}

/** Before the first /referencedata answer. */
const EMPTY_REFERENCE = readReferenceData();

export {
  STATUSES,
  STATUS_KEYS,
  HIDDEN_STATUSES,
  USAGES,
  PRIVATE_USAGES,
  CHECKINS,
  OUTCOMES,
  FAULT_REPORT_COMMENT,
  CONNECTOR_GROUPS,
  GROUP_KEYS,
  CONNECTION_TYPES,
  OCM_PROVIDER,
  EMPTY_REFERENCE,
  groupOf,
  typesOf,
  licenseName,
  readReferenceData,
};
