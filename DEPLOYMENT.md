# Deploying to Render and Turso

This setup uses one free Render web service and one free Turso database. Render
serves both the React production assets and Express API. Turso holds the shared
provider cache so Render spin-downs and redeploys do not erase successful LL2
or CelesTrak responses.

Current deployment:

- Application: <https://spacex-mission-data.onrender.com/>
- Health: <https://spacex-mission-data.onrender.com/api/health>
- Cache status: <https://spacex-mission-data.onrender.com/api/cache>
- Source: <https://github.com/mathieulehan/spacex-mission-dashboard>

## 1. Publish the Git repository

Create an empty GitHub repository, then connect and push this local `main`
branch:

```powershell
git remote add origin https://github.com/YOUR_ACCOUNT/spacex-mission-data.git
git push -u origin main
```

Do not commit `.env`, database files, or service tokens.

## 2. Create the Turso database

Create a free account at <https://app.turso.tech/signup>, then create one
database in the Turso dashboard. Copy:

- The database URL, which starts with `libsql://`.
- A database authentication token.

No schema migration command is needed. The application creates its `api_cache`
table on first startup.

The free database is the persistent cache. Successful LL2 and CelesTrak
responses are stored there with their fetch timestamps. Never expose the token
through a `VITE_` variable or browser code. Large payloads such as the full
CelesTrak Starlink dataset are compressed before storage to remain within
hosted request-size limits.

## 3. Create the Render service

1. Sign in at <https://dashboard.render.com/>.
2. Choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Render detects `render.yaml`; approve the `spacex-mission-data` service.
5. Enter `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` when prompted.
6. Create the Blueprint and wait for the health check to pass.

The Blueprint runs:

```text
Build: npm ci --include=dev && npm run build
Start: npm start
Health: /api/health
```

The explicit `--include=dev` is required because Render applies
`NODE_ENV=production` before the build. TypeScript and Vite are build-time
development dependencies; the flag installs them without changing the
production runtime environment.

## 4. Verify the deployment

Open the assigned `onrender.com` URL and check:

```text
/api/health
/api/cache
```

The health endpoint should return `{"status":"ok"}`. The cache page initially
shows empty rows and provider retry estimates. After successful provider
requests, `/api/cache` should show stored payload sizes and timestamps for LL2
and CelesTrak.

## Free-tier behavior

- Render sleeps after 15 minutes without inbound traffic and can take about one
  minute to wake.
- Render's local filesystem is ephemeral; only Turso-backed cache data
  persists.
- Turso free-plan quotas are more than sufficient for this small cache, but
  usage limits and provider plans can change.
- API rate limits still apply. Turso prevents duplicate downloads and preserves
  stale responses; it does not increase provider quotas.

## Local development

Leave both Turso variables empty. The app automatically continues to use
`.cache/mission-data.sqlite`, so local development and tests do not depend on a
cloud account.
