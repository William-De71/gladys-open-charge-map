// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface:
// appareil / Gerät / dispositivo, scène / Szene / escena; borne de recharge /
// Ladestation / punto de recarga. What drivers and operators write (station
// names, costs, comments) stays as they wrote it.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // places and devices
  placeN: { en: 'Place {n}', fr: 'Lieu {n}', de: 'Ort {n}', es: 'Lugar {n}' },
  zoneName: {
    en: 'Charging stations · {place}',
    fr: 'Bornes de recharge · {place}',
    de: 'Ladestationen · {place}',
    es: 'Puntos de recarga · {place}',
  },
  featureStations: {
    en: 'Stations in service',
    fr: 'Bornes en service',
    de: 'Ladestationen in Betrieb',
    es: 'Puntos en servicio',
  },
  featureFast: {
    en: 'Fast stations (50 kW+)',
    fr: 'Bornes rapides (50 kW+)',
    de: 'Schnellladestationen (50 kW+)',
    es: 'Puntos rápidos (50 kW+)',
  },
  featureNearest: {
    en: 'Nearest station',
    fr: 'Borne la plus proche',
    de: 'Nächste Ladestation',
    es: 'Punto más cercano',
  },
  featureSummary: { en: 'Summary', fr: 'Résumé', de: 'Zusammenfassung', es: 'Resumen' },
  featureStatus: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  featurePoints: {
    en: 'Charging points',
    fr: 'Points de charge',
    de: 'Ladepunkte',
    es: 'Puntos de carga',
  },
  featureDetails: { en: 'Details', fr: 'Détails', de: 'Details', es: 'Detalles' },
  featureCheckin: {
    en: 'Last check-in',
    fr: 'Dernier passage',
    de: 'Letzter Besuch',
    es: 'Última visita',
  },

  // zone summary
  zoneNone: {
    en: 'No station in service within {radius} matching the search.',
    fr: 'Aucune borne en service à moins de {radius} pour cette recherche.',
    de: 'Keine Ladestation in Betrieb im Umkreis von {radius} für diese Suche.',
    es: 'Ningún punto en servicio a menos de {radius} para esta búsqueda.',
  },
  zoneCount: {
    en: '{count} stations in service within {radius}, {fast} fast (50 kW+).',
    fr: '{count} bornes en service à moins de {radius}, dont {fast} rapides (50 kW+).',
    de: '{count} Ladestationen in Betrieb im Umkreis von {radius}, davon {fast} schnell (50 kW+).',
    es: '{count} puntos en servicio a menos de {radius}, {fast} rápidos (50 kW+).',
  },
  zoneNearest: {
    en: 'Nearest: {name}, {distance}.',
    fr: 'La plus proche : {name}, {distance}.',
    de: 'Nächste: {name}, {distance}.',
    es: 'El más cercano: {name}, {distance}.',
  },
  maxPower: { en: '{kw} kW max', fr: '{kw} kW max', de: 'max. {kw} kW', es: '{kw} kW máx.' },
  quoted: { en: '“{text}”', fr: '« {text} »', de: '„{text}“', es: '«{text}»' },

  // status of a station (StatusTypeID)
  status_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  status_available: { en: 'Available', fr: 'Disponible', de: 'Frei', es: 'Disponible' },
  status_in_use: { en: 'In use', fr: 'Occupée', de: 'Belegt', es: 'Ocupado' },
  status_temporarily_unavailable: {
    en: 'Temporarily down',
    fr: 'Indispo. temporaire',
    de: 'Vorübergehend aus',
    es: 'No disp. temporal',
  },
  status_operational: { en: 'In service', fr: 'En service', de: 'In Betrieb', es: 'En servicio' },
  status_partly_operational: {
    en: 'Partly in service',
    fr: 'En partie en service',
    de: 'Teilweise in Betrieb',
    es: 'Parcialmente operativo',
  },
  status_not_operational: {
    en: 'Out of service',
    fr: 'Hors service',
    de: 'Außer Betrieb',
    es: 'Fuera de servicio',
  },
  status_planned: { en: 'Planned', fr: 'Prévue', de: 'Geplant', es: 'Previsto' },
  status_removed: { en: 'Removed', fr: 'Retirée', de: 'Entfernt', es: 'Retirado' },

  // usage (UsageTypeID)
  usage_unknown: {
    en: 'Access unknown',
    fr: 'Accès inconnu',
    de: 'Zugang unbekannt',
    es: 'Acceso desconocido',
  },
  usage_public: { en: 'Public', fr: 'Public', de: 'Öffentlich', es: 'Público' },
  usage_membership: {
    en: 'Public, membership required',
    fr: 'Public, abonnement requis',
    de: 'Öffentlich, Mitgliedschaft nötig',
    es: 'Público, suscripción necesaria',
  },
  usage_pay_at_location: {
    en: 'Public, pay on site',
    fr: 'Public, paiement sur place',
    de: 'Öffentlich, Zahlung vor Ort',
    es: 'Público, pago in situ',
  },
  usage_notice: {
    en: 'Public, notice required',
    fr: 'Public, sur demande',
    de: 'Öffentlich, nach Anmeldung',
    es: 'Público, con aviso previo',
  },
  usage_private: { en: 'Private', fr: 'Privé', de: 'Privat', es: 'Privado' },
  usage_customers: {
    en: 'Customers and visitors',
    fr: 'Clients et visiteurs',
    de: 'Kunden und Besucher',
    es: 'Clientes y visitantes',
  },

  // check-ins (CheckinStatusTypeID)
  checkinNone: {
    en: 'No check-in yet.',
    fr: 'Aucun passage signalé.',
    de: 'Noch kein Besuch gemeldet.',
    es: 'Ninguna visita registrada.',
  },
  checkinComment: { en: 'Comment', fr: 'Commentaire', de: 'Kommentar', es: 'Comentario' },
  checkin_not_visited: {
    en: 'Did not visit',
    fr: 'Pas sur place',
    de: 'Nicht vor Ort',
    es: 'Sin visita',
  },
  checkin_charged: {
    en: 'Charged successfully',
    fr: 'Recharge réussie',
    de: 'Erfolgreich geladen',
    es: 'Recarga correcta',
  },
  checkin_charged_auto: {
    en: 'Charged successfully (automatic)',
    fr: 'Recharge réussie (automatique)',
    de: 'Erfolgreich geladen (automatisch)',
    es: 'Recarga correcta (automática)',
  },
  checkin_failed_not_operational: {
    en: 'Failed: equipment out of service',
    fr: 'Échec : équipement hors service',
    de: 'Fehlgeschlagen: Gerät außer Betrieb',
    es: 'Fallo: equipo fuera de servicio',
  },
  checkin_failed_not_installed: {
    en: 'Failed: not fully installed',
    fr: 'Échec : pas encore installée',
    de: 'Fehlgeschlagen: nicht fertig installiert',
    es: 'Fallo: no instalado del todo',
  },
  checkin_failed_problem: {
    en: 'Failed: equipment problem',
    fr: 'Échec : problème d’équipement',
    de: 'Fehlgeschlagen: Geräteproblem',
    es: 'Fallo: problema del equipo',
  },
  checkin_failed_not_compatible: {
    en: 'Failed: not compatible',
    fr: 'Échec : non compatible',
    de: 'Fehlgeschlagen: nicht kompatibel',
    es: 'Fallo: no compatible',
  },
  checkin_failed_access_card: {
    en: 'Failed: other card needed',
    fr: 'Échec : autre badge requis',
    de: 'Fehlgeschlagen: andere Karte nötig',
    es: 'Fallo: otra tarjeta necesaria',
  },
  checkin_failed_no_equipment: {
    en: 'Failed: no equipment there',
    fr: 'Échec : aucune borne sur place',
    de: 'Fehlgeschlagen: keine Ladestation vor Ort',
    es: 'Fallo: ningún equipo en el sitio',
  },
  checkin_in_use_ev: {
    en: 'Spot taken by an EV',
    fr: 'Place prise par un VE',
    de: 'Platz von E-Auto belegt',
    es: 'Plaza ocupada por un VE',
  },
  checkin_in_use_ice: {
    en: 'Spot taken by a non-EV',
    fr: 'Place prise par un thermique',
    de: 'Platz von Verbrenner belegt',
    es: 'Plaza ocupada por un no eléctrico',
  },
  checkin_not_accessible: {
    en: 'Not accessible',
    fr: 'Inaccessible',
    de: 'Nicht zugänglich',
    es: 'No accesible',
  },
  checkin_not_found: {
    en: 'Station not found',
    fr: 'Borne introuvable',
    de: 'Ladestation nicht gefunden',
    es: 'Punto no encontrado',
  },
  checkin_confirmed: {
    en: 'Details confirmed',
    fr: 'Informations confirmées',
    de: 'Angaben bestätigt',
    es: 'Datos confirmados',
  },
  checkin_duplicate: {
    en: 'Duplicate listing',
    fr: 'Fiche en double',
    de: 'Doppelter Eintrag',
    es: 'Ficha duplicada',
  },
  checkin_decommissioned: {
    en: 'Decommissioned',
    fr: 'Démontée',
    de: 'Abgebaut',
    es: 'Desmantelado',
  },
  checkin_other_bad: {
    en: 'Other (negative)',
    fr: 'Autre (négatif)',
    de: 'Sonstiges (negativ)',
    es: 'Otro (negativo)',
  },
  checkin_other_good: {
    en: 'Other (positive)',
    fr: 'Autre (positif)',
    de: 'Sonstiges (positiv)',
    es: 'Otro (positivo)',
  },
  checkin_fault_report: {
    en: 'Fault report',
    fr: 'Signalement de panne',
    de: 'Störungsmeldung',
    es: 'Aviso de avería',
  },
  outcome_success: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  outcome_failure: { en: 'Problem', fr: 'Problème', de: 'Problem', es: 'Problema' },
  outcome_other: { en: 'Info', fr: 'Info', de: 'Info', es: 'Info' },

  // widgets
  readAgo: {
    en: '{place} · {radius} · read {ago}',
    fr: '{place} · {radius} · lu {ago}',
    de: '{place} · {radius} · gelesen {ago}',
    es: '{place} · {radius} · leído {ago}',
  },
  rowInService: { en: 'In service', fr: 'En service', de: 'In Betrieb', es: 'En servicio' },
  rowFast: {
    en: 'Fast (50 kW+)',
    fr: 'Rapides (50 kW+)',
    de: 'Schnell (50 kW+)',
    es: 'Rápidos (50 kW+)',
  },
  rowNearest: { en: 'Nearest', fr: 'La plus proche', de: 'Nächste', es: 'Más cercano' },
  rowStatus: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  rowConnectors: { en: 'Connectors', fr: 'Prises', de: 'Stecker', es: 'Conectores' },
  rowUsage: {
    en: 'Access and cost',
    fr: 'Accès et tarif',
    de: 'Zugang und Preis',
    es: 'Acceso y tarifa',
  },
  rowVerified: {
    en: 'Last verified',
    fr: 'Vérifiée le',
    de: 'Zuletzt geprüft',
    es: 'Verificado el',
  },
  rowSource: { en: 'Data', fr: 'Données', de: 'Daten', es: 'Datos' },
  tilePower: { en: 'Max power', fr: 'Puissance max', de: 'Max. Leistung', es: 'Potencia máx.' },
  tilePoints: { en: 'Points', fr: 'Points', de: 'Ladepunkte', es: 'Puntos' },
  tileDistance: { en: 'Distance', fr: 'Distance', de: 'Entfernung', es: 'Distancia' },
  linkDetails: {
    en: 'Open Charge Map',
    fr: 'Open Charge Map',
    de: 'Open Charge Map',
    es: 'Open Charge Map',
  },
  linkDirections: { en: 'Directions', fr: 'Itinéraire', de: 'Route', es: 'Cómo llegar' },
  attribution: {
    en: 'Data: {providers}',
    fr: 'Données : {providers}',
    de: 'Daten: {providers}',
    es: 'Datos: {providers}',
  },
  detailConnectors: {
    en: 'Connectors: {value}',
    fr: 'Prises : {value}',
    de: 'Stecker: {value}',
    es: 'Conectores: {value}',
  },
  detailAddress: {
    en: 'Address: {value}',
    fr: 'Adresse : {value}',
    de: 'Adresse: {value}',
    es: 'Dirección: {value}',
  },
  detailOperator: {
    en: 'Operator: {value}',
    fr: 'Opérateur : {value}',
    de: 'Betreiber: {value}',
    es: 'Operador: {value}',
  },
  detailUsage: {
    en: 'Access: {value}',
    fr: 'Accès : {value}',
    de: 'Zugang: {value}',
    es: 'Acceso: {value}',
  },
  detailAccess: {
    en: 'How to get there: {value}',
    fr: 'Pour y accéder : {value}',
    de: 'Zufahrt: {value}',
    es: 'Cómo acceder: {value}',
  },
  detailCheckin: {
    en: 'Last check-in: {value}',
    fr: 'Dernier passage : {value}',
    de: 'Letzter Besuch: {value}',
    es: 'Última visita: {value}',
  },
  detailSource: {
    en: 'Data: {value}',
    fr: 'Données : {value}',
    de: 'Daten: {value}',
    es: 'Datos: {value}',
  },
  noStationBody: {
    en: 'No station within {radius} matches these filters. Widen the radius or the filters in the settings of the integration or of the widget.',
    fr: 'Aucune borne à moins de {radius} pour ces filtres. Élargissez le rayon ou les filtres dans les réglages de l’intégration ou du widget.',
    de: 'Keine Ladestation im Umkreis von {radius} passt zu diesen Filtern. Erweitern Sie Radius oder Filter in den Einstellungen der Integration oder des Widgets.',
    es: 'Ningún punto a menos de {radius} coincide con estos filtros. Amplíe el radio o los filtros en los ajustes de la integración o del widget.',
  },
  notReadYet: {
    en: 'Open Charge Map has not been read yet: a moment, please.',
    fr: 'Open Charge Map n’a pas encore été lu : un instant, s’il vous plaît.',
    de: 'Open Charge Map wurde noch nicht gelesen: einen Moment bitte.',
    es: 'Open Charge Map aún no se ha leído: un momento, por favor.',
  },
  placeNotRead: {
    en: 'The stations of this place could not be read yet.',
    fr: 'Les bornes de ce lieu n’ont pas encore pu être lues.',
    de: 'Die Ladestationen dieses Ortes konnten noch nicht gelesen werden.',
    es: 'Aún no se han podido leer los puntos de este lugar.',
  },
  stationNotRead: {
    en: 'This station has not been read yet: it is read with the next reading.',
    fr: 'Cette borne n’a pas encore été lue : elle le sera à la prochaine lecture.',
    de: 'Diese Ladestation wurde noch nicht gelesen: Sie wird bei der nächsten Abfrage gelesen.',
    es: 'Este punto aún no se ha leído: se leerá en la próxima lectura.',
  },
  chooseStation: {
    en: 'Add a station device (Discover tab), then choose it in the settings of this widget.',
    fr: 'Ajoutez un appareil borne (onglet Découverte), puis choisissez-le dans les réglages de ce widget.',
    de: 'Fügen Sie ein Ladestation-Gerät hinzu (Tab Entdecken) und wählen Sie es in den Einstellungen dieses Widgets.',
    es: 'Añada un dispositivo de punto de recarga (pestaña Descubrir) y elíjalo en los ajustes de este widget.',
  },

  // scenes
  summaryNewStation: {
    en: 'New charging station near {place}: {station}.',
    fr: 'Nouvelle borne de recharge près de {place} : {station}.',
    de: 'Neue Ladestation in der Nähe von {place}: {station}.',
    es: 'Nuevo punto de recarga cerca de {place}: {station}.',
  },
  summaryStatus: {
    en: '{name}: {status} (was {previous}).',
    fr: '{name} : {status} (avant : {previous}).',
    de: '{name}: {status} (vorher: {previous}).',
    es: '{name}: {status} (antes: {previous}).',
  },
  summaryCheckin: {
    en: '{name}: {checkin}',
    fr: '{name} : {checkin}',
    de: '{name}: {checkin}',
    es: '{name}: {checkin}',
  },
  summaryFind: {
    en: 'Nearest station: {station} ({status}), {address}.',
    fr: 'Borne la plus proche : {station} ({status}), {address}.',
    de: 'Nächste Ladestation: {station} ({status}), {address}.',
    es: 'Punto más cercano: {station} ({status}), {address}.',
  },
  summaryFindNone: {
    en: 'No matching station within {radius} of {place}.',
    fr: 'Aucune borne correspondante à moins de {radius} de {place}.',
    de: 'Keine passende Ladestation im Umkreis von {radius} um {place}.',
    es: 'Ningún punto que coincida a menos de {radius} de {place}.',
  },

  // connection status and configuration action
  noKey: {
    en: 'Enter your Open Charge Map API key (free, openchargemap.org > My profile > My apps).',
    fr: 'Saisissez votre clé d’API Open Charge Map (gratuite, openchargemap.org > My profile > My apps).',
    de: 'Geben Sie Ihren Open-Charge-Map-API-Schlüssel ein (kostenlos, openchargemap.org > My profile > My apps).',
    es: 'Introduzca su clave de API de Open Charge Map (gratuita, openchargemap.org > My profile > My apps).',
  },
  noPlace: {
    en: 'Choose a house of Gladys or type a position in the settings.',
    fr: 'Choisissez une maison de Gladys ou saisissez une position dans les réglages.',
    de: 'Wählen Sie ein Haus von Gladys oder geben Sie in den Einstellungen eine Position ein.',
    es: 'Elija una casa de Gladys o escriba una posición en los ajustes.',
  },
  statusConnected: {
    en: 'Open Charge Map read for {places} place(s).',
    fr: 'Open Charge Map lu pour {places} lieu(x).',
    de: 'Open Charge Map für {places} Ort(e) gelesen.',
    es: 'Open Charge Map leído para {places} lugar(es).',
  },
  statusPartial: {
    en: '{places} place(s) read, {failed} not: {problem}',
    fr: '{places} lieu(x) lu(s), {failed} non : {problem}',
    de: '{places} Ort(e) gelesen, {failed} nicht: {problem}',
    es: '{places} lugar(es) leído(s), {failed} no: {problem}',
  },
  statusBadKey: {
    en: 'Open Charge Map refuses the API key: check it in the settings.',
    fr: 'Open Charge Map refuse la clé d’API : vérifiez-la dans les réglages.',
    de: 'Open Charge Map lehnt den API-Schlüssel ab: prüfen Sie ihn in den Einstellungen.',
    es: 'Open Charge Map rechaza la clave de API: compruébela en los ajustes.',
  },
  statusBlocked: {
    en: 'Open Charge Map asks to slow down (too many requests): read less often.',
    fr: 'Open Charge Map demande de ralentir (trop de requêtes) : lisez moins souvent.',
    de: 'Open Charge Map bittet um weniger Anfragen: seltener abfragen.',
    es: 'Open Charge Map pide reducir el ritmo (demasiadas peticiones): lea con menos frecuencia.',
  },
  statusUnreachable: {
    en: 'Open Charge Map does not answer: tried again at the next reading.',
    fr: 'Open Charge Map ne répond pas : nouvel essai à la prochaine lecture.',
    de: 'Open Charge Map antwortet nicht: neuer Versuch bei der nächsten Abfrage.',
    es: 'Open Charge Map no responde: nuevo intento en la próxima lectura.',
  },
  statusUnexpected: {
    en: 'Open Charge Map gave an unexpected answer: tried again at the next reading.',
    fr: 'Open Charge Map a donné une réponse inattendue : nouvel essai à la prochaine lecture.',
    de: 'Open Charge Map gab eine unerwartete Antwort: neuer Versuch bei der nächsten Abfrage.',
    es: 'Open Charge Map dio una respuesta inesperada: nuevo intento en la próxima lectura.',
  },
  statusHouseNotLocated: {
    en: 'The house “{house}” has no position: place it in Settings > Houses.',
    fr: 'La maison « {house} » n’a pas de position : placez-la dans Paramètres > Maisons.',
    de: 'Das Haus „{house}“ hat keine Position: verorten Sie es unter Einstellungen > Häuser.',
    es: 'La casa «{house}» no tiene posición: sitúela en Ajustes > Casas.',
  },
  statusBadCoordinates: {
    en: '“{value}” is not a position: type latitude, longitude (46.3069, 4.8325).',
    fr: '« {value} » n’est pas une position : saisissez latitude, longitude (46.3069, 4.8325).',
    de: '„{value}“ ist keine Position: Breite, Länge eingeben (46.3069, 4.8325).',
    es: '«{value}» no es una posición: escriba latitud, longitud (46.3069, 4.8325).',
  },
  testPlace: {
    en: '{place} ({position}): {count} stations in service within {radius}, {fast} fast.',
    fr: '{place} ({position}) : {count} bornes en service à moins de {radius}, dont {fast} rapides.',
    de: '{place} ({position}): {count} Ladestationen in Betrieb im Umkreis von {radius}, davon {fast} schnell.',
    es: '{place} ({position}): {count} puntos en servicio a menos de {radius}, {fast} rápidos.',
  },

  // relative time
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * @description A text in a language, with its placeholders replaced.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('placeN', 'fr', { n: 2 }); // -> 'Lieu 2'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('statusConnected', { places: 1 });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
