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
