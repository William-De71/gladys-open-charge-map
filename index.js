// -----------------------------------------------------------------------------
// Entry point of the Open Charge Map external integration.
//
// Brings the public charging stations of Open Charge Map into Gladys, around
// up to three places (a house of Gladys or a typed position):
//   - a "zone" device per place (stations in service, fast ones, the nearest)
//     and a device per station to follow (status, points, details, last
//     check-in), offered on the Discovery screen (see src/device.js);
//   - scene triggers: new station around a place, status of a followed
//     station changed, new check-in at a followed station;
//   - a scene action: find the nearest station for a connector and a power;
//   - dashboard widgets: the nearest stations, one station.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Open Charge Map integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
