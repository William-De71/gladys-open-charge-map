# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the public EV charging
stations of [Open Charge Map](https://openchargemap.org): a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency.

It reads the official API `https://api.openchargemap.io/v3` with the free
personal key of the user (`X-API-Key` header): `GET /poi` around each place
(`latitude`, `longitude`, `distance`, `distanceunit=km`, `maxresults=250`,
`compact=true&verbose=false`, `minpowerkw` and `connectiontypeid` when set),
`GET /poi?chargepointid=…&includecomments=true` for the followed stations,
and `GET /referencedata` once a day for the operator and data provider names.
Places are a house of Gladys (`location: true`) or a typed position.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, places, reference data, status messages
src/ocm-api.js          the Open Charge Map API, error kinds
src/reference.js        status, usage, check-in and connector lists (static),
                        operators and data providers (from /referencedata)
src/stations.js         raw stations -> stations, distance, filters (pure)
src/watcher.js          the timer loop: zones, then the followed stations
src/tracker.js          snapshots -> scene trigger transitions (pure logic)
src/events.js           scene trigger payloads and scene action outputs
src/device.js           zone and station devices, their states
src/widgets.js          the "nearby" and "station" dashboard widgets
src/format.js           distances (km / mi), days, in the user's language
src/config.js           configuration (key, places, search, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## What Open Charge Map answers (recorded November 2026)

- Without a key, or with a wrong one: 403 and the text "You must specify an
  API key using the key query parameter or x-api-key header." Both are
  reported as a refused key.
- `/poi` in compact mode: reference objects become ids (`OperatorID`,
  `UsageTypeID`, `StatusTypeID`, `DataProviderID`, `ConnectionTypeID`), null
  fields are left out (any field may be missing), `NumberOfPoints` may be
  smaller than the sum of the connector quantities (kept as given).
- `StatusTypeID`: 50 "Operational" for nearly every station; 10 / 20
  "Currently available / in use (automated)" only where an operator shares
  its live status; 100 not operational, 150 planned, 200 / 210 removed
  (never listed). The live occupancy is therefore rarely known: say "in
  service", never "free", in user texts.
- `UserComments` (only with `includecomments=true`): `CheckinStatusTypeID`
  (10 charged, 20 to 50 failures, 100 / 110 spot taken…), `CommentTypeID`
  1000 = fault report, `UserName`, `Comment`, `DateCreated`.
- Data providers carry their own licence (`DataProviders[].License`): the
  terms ask to show it to the user. Every widget does.
- Test fixtures: real stations around Luxembourg City from the public export
  github.com/openchargemap/ocm-export (same compact form as the API).

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (zones on the house selector or the typed position,
  `house-maison`, `pos-46-3069-4-8325`; stations on the Open Charge Map id,
  never on a display name), feature `category` / `type` / `unit` / `min` /
  `max`, the option values of the trigger filters (`fast`, `change`,
  `outcome`), the connector group keys, the keys of `config_schema`,
  `actions`, the widgets and their settings, scene triggers (fields, options,
  variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Station status is `charging-station` / `connector-status`, 0 to 4**
  (0 available, 1 occupied, 2 reserved, 3 unavailable, 4 faulted, the enum of
  the Gladys core): "operational" is published as 0. Counts are
  `counter-sensor` / `integer`, the nearest station `distance-sensor` /
  `decimal` in km, texts `text` / `text`.
- **Be polite with Open Charge Map** (fair use policy): one request per place
  and per reading, one more for the followed stations, `/referencedata` once a
  day, a pause between two requests, never in parallel, the integration named
  in the User-Agent and in `client`, at least every hour (6 hours by
  default). A widget or a scene action never costs a request; creating
  station devices costs one request for the batch.
- **The key is a secret**: sent only to Open Charge Map, never logged.
- **`should_poll` stays false**; every feature is read-only.
- **The first reading of a zone or a station is a baseline**: no scene event
  replays the past after a restart; another search (radius, filters,
  position) is a new baseline for its zone. A failed reading changes nothing.
  A scene action never fires a scene trigger.
- **Attribution**: every widget shows the data provider and its licence.
- **The container rootfs is read-only.** Nothing is written, not even under
  `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `location: true` (house selector and coordinates), Gladys `>=5.3.0`,
  no `countries` (worldwide), transport `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
