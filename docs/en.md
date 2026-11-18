# Open Charge Map

## Overview

This integration brings the **public EV charging stations** listed on [Open Charge Map](https://openchargemap.org) into Gladys, around up to three places: a house of Gladys or a position you type.

- a device per place: stations in service around it, how many are fast (50 kW and more), and how far the nearest one is;
- a device per station you follow: its status, its charging points, power, connectors, access and cost, and the last check-in of a driver;
- scene triggers (new station nearby, status of a station changed, new check-in) and a scene action (find the nearest station for a connector and a power);
- two dashboard widgets: the nearest stations, and one station.

Open Charge Map is the open, worldwide registry of charging stations, filled by its community and by national registries. The integration reads its official API with your free personal key (cloud transport). The live occupancy of a station is only known where its operator shares it: most stations show "in service", not "free". This is a community integration, not affiliated with Open Charge Map.

![Nearby charging and Charging station widgets, around Luxembourg City (generated illustration, not a screenshot)](https://raw.githubusercontent.com/William-De71/gladys-open-charge-map/main/docs/assets/widgets.en.png)

## Requirements

- Gladys Assistant 5.3.0 or later.
- A free Open Charge Map API key: sign in on [openchargemap.org](https://openchargemap.org/loginprovider/beginlogin), open **My profile → My apps**, then **Register an application**; the key is shown with the application.
- Either a house of Gladys placed on the map (Settings → Houses), or a position (latitude, longitude).

## Configuration

1. Integrations → Open Charge Map → Configuration.
2. Paste the API key, choose a house or type a position for each place, set the search, then save.

| Field                      | Description                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| API key                    | Your Open Charge Map key. Sent to Open Charge Map only.                                         |
| House                      | A house of Gladys: its position is the center of the search.                                    |
| Or a position              | "46.3069, 4.8325", as a map app copies it. It wins over the house.                              |
| Radius                     | 1, 2, 5 (default), 10, 20 or 50 km around each place.                                           |
| Minimum power              | Any (default), 7, 11, 22, 50 or 150 kW, for at least one connector.                             |
| Connectors                 | Type 2, CCS, CHAdeMO, Type 1, Tesla / NACS, domestic socket. None checked: every connector.     |
| Public stations only       | On by default: leaves out private stations and those for customers only.                        |
| Stations offered           | The 5, 10 (default), 20 or 50 nearest of each place, in the Discover tab.                       |
| Open Charge Map read every | 1, 3, 6 (default), 12 or 24 hours. One request per place, one more for the stations you follow. |
| Language of the texts      | Device names, summaries and scene texts. Automatic: the language of your dashboard.             |

**Test the key and the places** reads Open Charge Map at once and shows, for each place, its position and the stations found.

## Usage

### Devices

Devices → Open Charge Map → **Discover**, then add your place ("Charging stations · Home") and the stations you use.

| Device  | Feature             | Gladys type                                                                                |
| ------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Place   | Stations in service | Counter: stations in service within the radius that match the search                       |
|         | Fast stations       | Counter: of them, those with a connector of 50 kW or more                                  |
|         | Nearest station     | Distance (km)                                                                              |
|         | Summary             | Text: "12 stations in service within 5 km, 3 fast (50 kW+). Nearest: Lidl, 0.8 km."        |
| Station | Status              | Charging station, connector status: Available (in service), Occupied, Unavailable, Faulted |
|         | Charging points     | Counter                                                                                    |
|         | Details             | Text: status, maximum power, connectors, access and cost                                   |
|         | Last check-in       | Text: "Charged successfully, 15/11/2026 (Lena)" and the comment of the driver              |

"Available" is what Gladys shows for a station in service: Open Charge Map knows whether a station works, rarely whether it is free right now. The check-ins of a station are read once you add its device.

### Scenes

Triggers:

- **Open Charge Map: new station nearby**: a station recently listed on Open Charge Map appears within the radius of a place. Filters: the place, fast (50 kW+) or not.
- **Open Charge Map: station status changed**: a station you added goes out of service, comes back, or changes status. Filters: the station, the change.
- **Open Charge Map: new check-in**: a driver reports a charge, a problem or a comment at a station you added. Filters: the station, the outcome (success, problem, other).

Action:

- **Open Charge Map: find a station**: the nearest station of a place for a connector and a minimum power, from the last reading: name, address, distance, power, connectors, operator, status, position, Open Charge Map page and a ready-made sentence.

Examples:

- When the fast charger I use goes out of service → send a message with `{{triggerEvent.data.summary}}`.
- When a driver reports a problem at my usual station → notify me before I leave.
- When a new fast station is listed near home → send its name and its distance.
- When the car battery is low (with your car integration) → find the nearest CCS station of 50 kW and send its summary in a message.

### Widgets

Dashboard → Edit → add **Nearby charging**: choose the place, a connector, a minimum power and how many stations to show. Each card gives the distance, the operator, the power and the status; it opens on the connectors, the address, the access and cost, the last check-in, the data source, and links to Open Charge Map and to the directions.

Add **Charging station** for a station you follow: maximum power, points and distance, the last check-ins of drivers, the status, connectors, access and cost, the date of the last verification and the data source.

Every widget shows the data provider of the stations and its licence (Open Charge Map Contributors, CC BY 4.0, or the national registry the data comes from), as the terms of Open Charge Map ask.

## Troubleshooting

- **"Open Charge Map refuses the API key"**: copy the key again from My profile → My apps; a key is personal to your account.
- **"Not a position"**: type the latitude, a comma, then the longitude, with a dot for the decimals: `46.3069, 4.8325`.
- **"The house has no position"**: place the house on the map in Settings → Houses.
- **No station, or too few**: widen the radius, untick connectors or lower the minimum power; check the area on the [Open Charge Map map](https://map.openchargemap.io).
- **"Open Charge Map asks to slow down"**: read less often; the fair use policy of Open Charge Map asks not to repeat queries.
- **A station is wrong or missing**: Open Charge Map is filled by its users: correct it, or add a check-in, on its page (link in the widget).
- **Logs**: add the environment variable `DEBUG=gladys-integration-sdk`, then open an issue on [GitHub](https://github.com/William-De71/gladys-open-charge-map/issues) with the Gladys and integration versions and the logs (never your API key).
