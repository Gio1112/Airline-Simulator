# Airline Simulator

A modern web-based airline management game focused on fleet strategy, route planning, scheduling, passenger demand, and airline growth.

## v0.1 foundation

The first branch contains a playable local vertical slice:

- Create an airline and choose a hub
- Start with $25M
- Lease aircraft from a starter catalogue
- Open hub routes with range validation
- Estimate route demand
- Simulate operating days
- Track load factor, passengers, revenue, costs, and profit
- Supabase schema + RLS groundwork for persistence/multiplayer

The current simulation intentionally runs in local React state so the game can be tested immediately without credentials. The next milestone is moving mutations and game state into trusted server-side Supabase actions.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Cloudflare Pages

This project is configured as a static Next.js export, so the current prototype can be hosted directly on Cloudflare Pages.

1. Open Cloudflare Dashboard → Workers & Pages.
2. Choose **Create application** → **Pages** → **Import an existing Git repository**.
3. Select `Gio1112/Airline-Simulator`.
4. Use the **Next.js (Static HTML Export)** framework preset.
5. Set the production branch to `main` after the Cloudflare deployment PR is merged.
6. Build command: `npx next build`
7. Build output directory: `out`
8. Deploy.

Cloudflare will give the project a `*.pages.dev` address and rebuild it automatically whenever the production branch changes. Pull requests can also receive preview deployments.

## Optional Supabase setup

Copy `.env.example` to `.env.local` and configure your Supabase keys. The starter migration lives at `supabase/migrations/0001_initial.sql`.

## Architecture

- `src/components` — player-facing UI
- `src/game` — pure game rules, data and simulation
- `src/lib` — infrastructure clients
- `supabase/migrations` — persistent backend schema

## Next milestone

1. Supabase authentication
2. Server-authoritative airline creation and leasing
3. Airport dataset import
4. Persistent routes and transaction ledger
5. Scheduled flight entities and live map
