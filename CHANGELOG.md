# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Public EV charging stations from the Open Charge Map API (free personal API key), around up to three places: a house of Gladys or a typed position. Search radius, minimum power, connector types (Type 2, CCS, CHAdeMO, Type 1, Tesla / NACS, domestic) and public stations only, read every 1 to 24 hours (6 by default).
- A device per place: stations in service, fast stations (50 kW and more), distance to the nearest one, and a summary sentence.
- A device per station you follow, among the nearest of each place: status (as a Gladys charging station connector status), charging points, details (power, connectors, access, cost) and the last check-in of a driver.
- Scene triggers: new station listed near a place (filter: fast), status of a followed station changed (out of service, back in service), new check-in at a followed station (filter: success, problem, other).
- A "find a station" scene action: the nearest station of a place for a connector and a power, from the last reading.
- Dashboard widgets: the nearest stations of a place (filters per widget, details, links to Open Charge Map and to the directions) and one followed station (status, power, points, distance, last check-ins).
- The data provider and its licence are shown with every station, as the terms of Open Charge Map ask.
- A "Test the key and the places" button; English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
