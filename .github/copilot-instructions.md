# Copilot instructions

## Project intent

Maintain a reliable, responsive SpaceX mission dashboard backed by Launch
Library 2 and CelesTrak. This is community data, not official SpaceX telemetry.
Do not describe orbital elements as live spacecraft telemetry.

## Stack and layout

- React 19, TypeScript, Vite, and TanStack Query in `src/`.
- Express 5 and Zod in `server/`.
- Vitest and Testing Library for tests.
- Node.js 22.5+ is required because the LL2 disk cache uses `node:sqlite`.
- Read `ARCHITECTURE.md` before changing data flow or cache behavior.

## Engineering conventions

- Keep upstream HTTP access server-side. Browser code calls only local `/api`
  routes.
- Validate all external payloads in `server/schemas.ts` before normalization,
  caching, or returning data.
- Keep browser contracts normalized and explicit in `src/types.ts`.
- Reuse normalization and formatting helpers instead of duplicating mappings.
- Preserve independent failure handling for launches, events, and Starlink.
- Never silently substitute fallback data. Maintain accurate `stale` and
  `sampled` states and visible UI labels.
- Do not weaken UUID validation on mission-detail routes.
- Do not add API keys, credentials, `.env` files, cache databases, or generated
  build output to Git.
- Keep UI controls keyboard accessible and use semantic buttons or links.
- Follow the existing concise TypeScript style and avoid unnecessary casts.

## Cache rules

- LL2 has a ten-minute freshness window and persists validated payloads in
  `.cache/mission-data.sqlite`.
- Preserve stale-while-error behavior: refresh expired rows, update them only
  after successful validation, and serve the prior valid row on upstream
  failure.
- CelesTrak downloads must remain at least two hours apart.
- Persist CelesTrak writes atomically and retain cooldown backoff.
- Bootstrap snapshots are a last resort when no disk data exists; never present
  their counts as a complete source dataset.

## Validation

Use the smallest targeted test while iterating, then run all checks before
finishing:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Add or update tests for changes to normalization, response contracts, cache
behavior, fallback labeling, or user interactions. Mock upstream responses in
tests; do not depend on live provider availability.
