"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AppleNetworkMap as NetworkMap } from "@/components/apple-network-map";
import { aircraftTypeById, aircraftTypes, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand, simulateDay } from "@/game/simulation";
import type { Airline, RouteResult } from "@/game/types";

const STARTING_CASH = 25_000_000;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;
type AirlineSetter = Dispatch<SetStateAction<Airline | null>>;

export function GameShell() {
  const [airline, setAirline] = useState<Airline | null>(null);
  const [results, setResults] = useState<RouteResult[]>([]);
  const [tab, setTab] = useState<"overview" | "fleet" | "routes">("overview");
  const [routeDraftDestination, setRouteDraftDestination] = useState<string | null>(null);
  const [notice, setNotice] = useState("Map-first prototype: airport geography is real; demand and economics are still game-model estimates.");

  if (!airline) return <Onboarding onCreate={setAirline} />;

  const advanceDay = () => {
    const outcome = simulateDay(airline);
    setResults(outcome.results);
    setAirline((current) => current ? {
      ...current,
      day: current.day + 1,
      cash: current.cash + outcome.profit,
      lifetimeProfit: current.lifetimeProfit + outcome.profit,
      reputation: Math.min(100, current.reputation + (outcome.results.length ? 0.15 : 0)),
    } : current);
    setNotice(`Day ${airline.day} completed: ${outcome.profit >= 0 ? "+" : ""}${money(outcome.profit)} operating result.`);
  };

  const planRoute = (iata: string) => {
    if (iata === airline.hub) return;
    setRouteDraftDestination(iata);
    setTab("routes");
    setNotice(`Planning ${airline.hub}–${iata}. Choose an aircraft, frequency and fare.`);
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">{airline.code}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{airline.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Hub {airline.hub} · Day {airline.day} · Reputation {airline.reputation.toFixed(1)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-[var(--muted)]">Available cash</div>
            <div className="font-mono text-lg font-semibold">{money(airline.cash)}</div>
          </div>
          <button onClick={advanceDay} className="rounded-lg bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-200">Advance day →</button>
        </div>
      </header>

      <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">{notice}</div>

      <nav className="mb-5 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1">
        {(["overview", "fleet", "routes"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-sm ${tab === item ? "bg-slate-700 text-white" : "text-[var(--muted)] hover:text-white"}`}>{item === "overview" ? "Map" : item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </nav>

      {tab === "overview" && <Overview airline={airline} results={results} onPlanRoute={planRoute} />}
      {tab === "fleet" && <Fleet airline={airline} setAirline={setAirline} setNotice={setNotice} />}
      {tab === "routes" && <Routes airline={airline} setAirline={setAirline} setNotice={setNotice} results={results} requestedDestination={routeDraftDestination} onDestinationConsumed={() => setRouteDraftDestination(null)} />}
    </main>
  );
}

function Onboarding({ onCreate }: { onCreate: (airline: Airline) => void }) {
  const [name, setName] = useState("Continental");
  const [code, setCode] = useState("CO");
  const [hub, setHub] = useState("PHX");
  const [hubQuery, setHubQuery] = useState("PHX");
  const hubMatches = useMemo(() => airportMatches(hubQuery, 12), [hubQuery]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">Airline Simulator · v0.2</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl">Build an airline that actually has to work.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted)]">Start with $25M, choose a hub from thousands of real airports, lease aircraft, build routes and watch your network form on the map.</p>
        </section>
        <form className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5" onSubmit={(event) => {
          event.preventDefault();
          onCreate({ name: name.trim() || "New Airline", code: (code.trim() || "NA").slice(0, 3).toUpperCase(), hub, cash: STARTING_CASH, reputation: 50, day: 1, fleet: [], routes: [], lifetimeProfit: 0 });
        }}>
          <h2 className="text-lg font-semibold">Create airline</h2>
          <label className="mt-5 block text-sm text-[var(--muted)]">Airline name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white outline-none focus:border-sky-300" /></label>
          <label className="mt-4 block text-sm text-[var(--muted)]">Code<input value={code} onChange={(e) => setCode(e.target.value)} maxLength={3} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 uppercase text-white outline-none focus:border-sky-300" /></label>
          <label className="mt-4 block text-sm text-[var(--muted)]">Starting hub<input value={hubQuery} onChange={(e) => setHubQuery(e.target.value)} placeholder="Search IATA, city or airport" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white outline-none focus:border-sky-300" /></label>
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1">
            {hubMatches.map((airport) => <button type="button" key={airport.iata} onClick={() => { setHub(airport.iata); setHubQuery(`${airport.iata} — ${airport.city}`); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${hub === airport.iata ? "bg-sky-400/15 text-sky-200" : "text-[var(--muted)] hover:bg-white/5 hover:text-white"}`}><span><span className="font-mono text-white">{airport.iata}</span> · {airport.city}</span><span className="ml-3 truncate text-xs opacity-60">{airport.name}</span></button>)}
          </div>
          <div className="mt-2 text-xs text-[var(--muted)]">Selected hub: <span className="font-mono text-white">{hub}</span> · {airportByIata(hub)?.name}</div>
          <button className="mt-6 w-full rounded-lg bg-sky-300 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-200">Launch airline</button>
        </form>
      </div>
    </main>
  );
}

function Overview({ airline, results, onPlanRoute }: { airline: Airline; results: RouteResult[]; onPlanRoute: (iata: string) => void }) {
  const todayProfit = results.reduce((sum, item) => sum + item.profit, 0);
  const passengers = results.reduce((sum, item) => sum + item.passengers, 0);
  const activeAircraft = new Set(airline.routes.map((route) => route.aircraftId)).size;
  const kpis = [
    ["Fleet", airline.fleet.length.toString(), `${activeAircraft} assigned`],
    ["Routes", airline.routes.length.toString(), `${airline.routes.reduce((sum, route) => sum + route.weeklyFrequency, 0)} flights / week`],
    ["Passengers", passengers.toLocaleString(), "last simulated day"],
    ["Operating result", money(todayProfit), "last simulated day"],
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value, helper]) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{helper}</div>
          </div>
        ))}
      </section>
      <NetworkMap airline={airline} results={results} onPlanRoute={onPlanRoute} />
    </div>
  );
}

function Fleet({ airline, setAirline, setNotice }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void }) {
  const lease = (typeId: string) => {
    const type = aircraftTypeById(typeId);
    if (!type) return;
    const deposit = type.monthlyLease * 2;
    if (airline.cash < deposit) return setNotice("Not enough cash for the two-month lease deposit.");
    const number = airline.fleet.length + 1;
    const aircraft = { id: crypto.randomUUID(), typeId, registration: `N${300 + number}${airline.code.slice(0, 2)}`, condition: 100 };
    setAirline((current) => current ? { ...current, cash: current.cash - deposit, fleet: [...current.fleet, aircraft] } : current);
    setNotice(`${type.manufacturer} ${type.model} leased. ${money(deposit)} deposit paid.`);
  };

  return <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">Aircraft market</h2><p className="mt-1 text-sm text-[var(--muted)]">Lease deposit is two months.</p><div className="mt-4 space-y-2">{aircraftTypes.map((type) => <div key={type.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div><div className="font-medium">{type.manufacturer} {type.model}</div><div className="text-xs text-[var(--muted)]">{type.seats} seats · {type.rangeKm.toLocaleString()} km · {money(type.monthlyLease)}/mo</div></div><button onClick={() => lease(type.id)} className="rounded-md border border-sky-400/40 px-3 py-2 text-sm text-sky-200 hover:bg-sky-400/10">Lease</button></div>)}</div></section>
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">Your fleet</h2><div className="mt-4 space-y-2">{airline.fleet.length === 0 ? <p className="text-sm text-[var(--muted)]">No aircraft yet.</p> : airline.fleet.map((aircraft) => { const type = aircraftTypeById(aircraft.typeId); const assigned = airline.routes.find((route) => route.aircraftId === aircraft.id); return <div key={aircraft.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-slate-800 text-xs font-semibold">{type?.manufacturer.slice(0, 1)}</div><div><div className="font-medium">{aircraft.registration} · {type?.model}</div><div className="text-xs text-[var(--muted)]">Condition {aircraft.condition}% · {assigned ? `${assigned.origin}–${assigned.destination}` : "Unassigned"}</div></div><div className="font-mono text-xs text-[var(--muted)]">{type?.seats} seats</div></div>; })}</div></section>
  </div>;
}

function Routes({ airline, setAirline, setNotice, results, requestedDestination, onDestinationConsumed }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void; results: RouteResult[]; requestedDestination: string | null; onDestinationConsumed: () => void }) {
  const freeAircraft = airline.fleet.filter((aircraft) => !airline.routes.some((route) => route.aircraftId === aircraft.id));
  const initialDestination = airports.find((a) => a.iata !== airline.hub)?.iata ?? "LAX";
  const [destination, setDestination] = useState(initialDestination);
  const [destinationQuery, setDestinationQuery] = useState(initialDestination);
  const [aircraftId, setAircraftId] = useState(freeAircraft[0]?.id ?? "");
  const [frequency, setFrequency] = useState(14);
  const [fare, setFare] = useState(149);

  useEffect(() => {
    if (!requestedDestination || requestedDestination === airline.hub) return;
    const airport = airportByIata(requestedDestination);
    if (!airport) return;
    setDestination(airport.iata);
    setDestinationQuery(`${airport.iata} — ${airport.city}`);
    onDestinationConsumed();
  }, [airline.hub, onDestinationConsumed, requestedDestination]);

  useEffect(() => {
    if (!aircraftId && freeAircraft[0]) setAircraftId(freeAircraft[0].id);
  }, [aircraftId, freeAircraft]);

  const selectedAircraft = airline.fleet.find((item) => item.id === aircraftId);
  const selectedType = selectedAircraft ? aircraftTypeById(selectedAircraft.typeId) : undefined;
  const distance = distanceKm(airline.hub, destination);
  const demand = estimateDailyDemand(airline.hub, destination);
  const destinationMatches = useMemo(() => airportMatches(destinationQuery, 18).filter((airport) => airport.iata !== airline.hub), [airline.hub, destinationQuery]);

  const createRoute = () => {
    if (!aircraftId) return setNotice("Lease an aircraft first, or choose an unassigned aircraft.");
    if (!selectedType) return setNotice("Aircraft type could not be resolved.");
    if (airline.routes.some((route) => route.origin === airline.hub && route.destination === destination)) return setNotice("You already operate that route.");
    if (distance > selectedType.rangeKm) return setNotice(`${selectedType.model} does not have enough range for this route.`);
    const route = { id: crypto.randomUUID(), origin: airline.hub, destination, aircraftId, weeklyFrequency: Math.max(1, Math.min(35, frequency)), economyFare: Math.max(39, fare) };
    setAirline((current) => current ? { ...current, routes: [...current.routes, route] } : current);
    setAircraftId("");
    setNotice(`${airline.hub}–${destination} opened with ${route.weeklyFrequency} weekly flights.`);
  };

  const resultFor = (routeId: string) => results.find((result) => result.routeId === routeId);

  return <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">Open route</h2><label className="mt-4 block text-sm text-[var(--muted)]">Destination<input value={destinationQuery} onChange={(e) => setDestinationQuery(e.target.value)} placeholder="Search IATA, city or airport" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white outline-none focus:border-sky-300" /></label><div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1">{destinationMatches.map((airport) => <button type="button" key={airport.iata} onClick={() => { setDestination(airport.iata); setDestinationQuery(`${airport.iata} — ${airport.city}`); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${destination === airport.iata ? "bg-sky-400/15 text-sky-200" : "text-[var(--muted)] hover:bg-white/5 hover:text-white"}`}><span><span className="font-mono text-white">{airport.iata}</span> · {airport.city}</span><span className="ml-3 truncate text-xs opacity-60">{airport.country}</span></button>)}</div><label className="mt-4 block text-sm text-[var(--muted)]">Aircraft<select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white"><option value="">Select aircraft</option>{freeAircraft.map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} — {aircraftTypeById(aircraft.typeId)?.model}</option>)}</select></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm text-[var(--muted)]">Weekly flights<input type="number" min="1" max="35" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white" /></label><label className="text-sm text-[var(--muted)]">Economy fare<input type="number" min="39" value={fare} onChange={(e) => setFare(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white" /></label></div><div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm"><div className="flex justify-between"><span className="text-[var(--muted)]">Route</span><span className="font-mono">{airline.hub} → {destination}</span></div><div className="mt-2 flex justify-between"><span className="text-[var(--muted)]">Distance</span><span>{distance.toLocaleString()} km</span></div><div className="mt-2 flex justify-between"><span className="text-[var(--muted)]">Estimated market</span><span>{demand.toLocaleString()} pax/day</span></div><div className="mt-2 flex justify-between"><span className="text-[var(--muted)]">Range check</span><span className={selectedType && distance <= selectedType.rangeKm ? "text-green-300" : "text-[var(--muted)]"}>{selectedType ? (distance <= selectedType.rangeKm ? "PASS" : "FAIL") : "—"}</span></div></div><button onClick={createRoute} className="mt-4 w-full rounded-lg bg-sky-300 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-200">Open route</button></section>
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">Route performance</h2><div className="mt-4 space-y-2">{airline.routes.length === 0 ? <p className="text-sm text-[var(--muted)]">No routes yet.</p> : airline.routes.map((route) => { const aircraft = airline.fleet.find((item) => item.id === route.aircraftId); const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined; const result = resultFor(route.id); return <div key={route.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-lg">{route.origin} → {route.destination}</div><div className="mt-1 text-xs text-[var(--muted)]">{type?.model} · {route.weeklyFrequency}× weekly · fare {money(route.economyFare)}</div></div>{result && <div className={`text-right ${result.profit >= 0 ? "text-green-300" : "text-rose-300"}`}><div className="font-mono font-semibold">{result.profit >= 0 ? "+" : ""}{money(result.profit)}</div><div className="text-xs opacity-70">last day</div></div>}</div>{result && <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="text-[var(--muted)]">Flights</span><div className="mt-1 text-sm">{result.flights}</div></div><div><span className="text-[var(--muted)]">Passengers</span><div className="mt-1 text-sm">{result.passengers}</div></div><div><span className="text-[var(--muted)]">Load factor</span><div className="mt-1 text-sm">{pct(result.loadFactor)}</div></div></div>}</div>; })}</div></section>
  </div>;
}

function airportMatches(query: string, limit: number) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return airports.slice(0, limit);
  return airports
    .map((airport) => {
      const iata = airport.iata.toLowerCase();
      const city = airport.city.toLowerCase();
      const name = airport.name.toLowerCase();
      const country = airport.country.toLowerCase();
      let score = 100;
      if (iata === normalized) score = 0;
      else if (iata.startsWith(normalized)) score = 1;
      else if (city === normalized) score = 2;
      else if (city.startsWith(normalized)) score = 3;
      else if (name.startsWith(normalized)) score = 4;
      else if (`${iata} ${city} ${name} ${country}`.includes(normalized)) score = 10;
      return { airport, score };
    })
    .filter((item) => item.score < 100)
    .sort((a, b) => a.score - b.score || b.airport.demand - a.airport.demand)
    .slice(0, limit)
    .map((item) => item.airport);
}
