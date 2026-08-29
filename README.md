# SpaceX Mission Data

A responsive dashboard for upcoming SpaceX missions, operational events, and
Starlink orbital elements. It combines public data from:

- **Live dashboard:** <https://spacex-mission-data.onrender.com/>
- [Launch Library 2](https://thespacedevs.com/llapi) for launch schedules,
  mission status, pads, weather, vehicle stages, recovery plans, media, and
  events.
- [CelesTrak GP](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
  for current Starlink orbital elements.

This project is not affiliated with or endorsed by SpaceX. CelesTrak general
perturbations data is orbital element data, not live spacecraft telemetry.

## Highlights

- Upcoming mission manifest with countdowns and launch status.
- Mission and event search with rocket and event-type filters.
- Downloadable iCalendar reminders for every listed launch.
- In-app mission detail drawer with vehicle, recovery, timeline, media, and
  update information.
- SpaceX event cards with visible webcast and detail actions.
- Starlink orbital summary and sampled RAAN/inclination visualization.
- Interactive 3D Earth with approximate Starlink positions propagated from
  orbital elements.
- Runtime validation of upstream payloads with Zod.
- Persistent disk caching and explicit stale/bootstrap states when upstream
  services are rate-limited.
- Data-status dashboard for cache freshness, size, and stored mission details.
- Provider-aware estimates for the next refresh attempt and its limiting reason.
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

Launch reminder links generate local `.ics` files containing the current launch
window, location, status, mission description, and LL2 source URL. Calendar
events are marked tentative because launch schedules can move; refresh the
dashboard and export a new event after schedule changes.

The Starlink globe is rendered locally with Three.js. Drag it to rotate the
Earth and inspect the constellation distribution. Coastlines and country
boundaries come from the bundled
[Natural Earth](https://www.naturalearthdata.com/) 1:110m dataset through
`world-atlas`; the texture is generated in the browser and requires no external
map tiles or imagery service. Natural Earth data is public domain.

Production:

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

## Free deployment

The repository includes a Render Blueprint and supports Turso as its production
cache database. See [Deploying to Render and Turso](DEPLOYMENT.md) for the
account, secret, deployment, and verification steps.

- Production: <https://spacex-mission-data.onrender.com/>
- With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, the server uses Turso.
- Without those variables, it uses local `.cache/mission-data.sqlite`.

## API routes

| Route | Description |
| --- | --- |
| `GET /api/health` | Service health |
| `GET /api/launches` | Six upcoming SpaceX launches |
| `GET /api/launches/:id` | Rich detail for a validated launch UUID |
| `GET /api/events` | Upcoming SpaceX operational events |
| `GET /api/starlink` | Starlink orbital metrics, plot data, and recent elements |
| `GET /api/cache` | Safe cache freshness and size metadata; never payload contents |

`/api/cache` also reports the estimated next attempt for each source. Healthy
rows use their cache-expiry time, LL2 uses `Retry-After` or rate-reset headers
when available (with a conservative one-hour fallback), and CelesTrak uses the
service's enforced local cooldown. These are retry estimates, not guarantees
that an upstream provider will accept or publish new data at that instant.

## Cache and fallback behavior

Launch Library 2 responses have a ten-minute freshness window. Successful
launch, event, and detail payloads are stored in
`.cache/mission-data.sqlite`. The SQLite database survives server restarts.
After expiry, the next request refreshes the row; if LL2 is rate-limited or
unavailable, the last valid row is served with a stale marker instead.

CelesTrak records use the same SQLite database under the
`celestrak:starlink` key and remain fresh for two hours to respect the provider's
download policy. During an outage or cooldown, the last successful dataset is
served. If no cache exists, the app uses a clearly labeled six-record bootstrap
sample. If CelesTrak rejects the primary group download during its cooldown, the
server tries CelesTrak's supplemental Starlink GP feed before using fallback
data.

When no LL2 database row exists and the anonymous limit is active, bounded
built-in launch and event snapshots keep the dashboard useful. The interface
labels these snapshots and never presents their record counts as a complete
live dataset.

On a cold start with both providers already limiting this IP, LL2 becomes
available after its anonymous request window resets, generally within the next
hour. The server retries LL2 on a later dashboard request. CelesTrak retries no
more than once every two hours; after a rejected download, keep the server
running and allow the full local cooldown to elapse before refreshing.

Both `.cache/` and build outputs are ignored by Git.

## Project documentation

- [Architecture](ARCHITECTURE.md)
- [Render and Turso deployment](DEPLOYMENT.md)
- [Copilot repository instructions](.github/copilot-instructions.md)

## Data and security

No API keys are required. Do not add upstream credentials to browser code or
commit `.env` files. External data is fetched by the Express server, validated,
normalized, and then exposed through the local `/api` routes.
