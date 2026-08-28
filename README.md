# SpaceX Mission Data

A responsive dashboard for upcoming SpaceX missions, operational events, and
Starlink orbital elements. It combines public data from:

- [Launch Library 2](https://thespacedevs.com/llapi) for launch schedules,
  mission status, pads, weather, vehicle stages, recovery plans, media, and
  events.
- [CelesTrak GP](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
  for current Starlink orbital elements.

This project is not affiliated with or endorsed by SpaceX. CelesTrak general
perturbations data is orbital element data, not live spacecraft telemetry.

## Highlights

- Upcoming mission manifest with countdowns and launch status.
- In-app mission detail drawer with vehicle, recovery, timeline, media, and
  update information.
- SpaceX event cards with visible webcast and detail actions.
- Starlink orbital summary and sampled RAAN/inclination visualization.
- Runtime validation of upstream payloads with Zod.
- Persistent disk caching and explicit stale/bootstrap states when upstream
  services are rate-limited.
- Responsive, accessible React interface with isolated section failures.

## Requirements

- Node.js 22.5 or newer (`node:sqlite` is used for the persistent cache).
- npm.

If Node is not installed system-wide, a JetBrains-managed Node runtime works:

```powershell
$nodeDir = "$env:APPDATA\JetBrains\IntelliJIdea2025.3\node\versions\24.18.0"
$env:PATH = "$nodeDir;$env:PATH"
& "$nodeDir\npm.cmd" install
& "$nodeDir\npm.cmd" run dev
```

## Development

```powershell
npm install
npm run dev
```

The React client runs at `http://localhost:5173`. Vite proxies `/api` requests
to the Express server at `http://localhost:8787`.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API and Vite development server |
| `npm test` | Run server and UI tests once |
| `npm run typecheck` | Type-check client and server |
| `npm run lint` | Run ESLint |
| `npm run build` | Build client and server production output |
| `npm start` | Serve the production build on port 8787 |

Production:

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

## API routes

| Route | Description |
| --- | --- |
| `GET /api/health` | Service health |
| `GET /api/launches` | Six upcoming SpaceX launches |
| `GET /api/launches/:id` | Rich detail for a validated launch UUID |
| `GET /api/events` | Upcoming SpaceX operational events |
| `GET /api/starlink` | Starlink orbital metrics, plot data, and recent elements |

## Cache and fallback behavior

Launch Library 2 responses have a ten-minute freshness window. Successful
launch, event, and detail payloads are stored in
`.cache/mission-data.sqlite`. The SQLite database survives server restarts.
After expiry, the next request refreshes the row; if LL2 is rate-limited or
unavailable, the last valid row is served with a stale marker instead.

CelesTrak data is stored in `.cache/starlink.json` for two hours to respect its
download policy. During an outage or cooldown, the last successful dataset is
served. If no cache exists, the app uses a clearly labeled six-record bootstrap
sample.

When no LL2 database row exists and the anonymous limit is active, bounded
built-in launch and event snapshots keep the dashboard useful. The interface
labels these snapshots and never presents their record counts as a complete
live dataset.

Both `.cache/` and build outputs are ignored by Git.

## Project documentation

- [Architecture](ARCHITECTURE.md)
- [Copilot repository instructions](.github/copilot-instructions.md)

## Data and security

No API keys are required. Do not add upstream credentials to browser code or
commit `.env` files. External data is fetched by the Express server, validated,
normalized, and then exposed through the local `/api` routes.
