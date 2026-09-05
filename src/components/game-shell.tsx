"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { NetworkMap } from "@/components/network-map";
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

  const planRouteFromMap = (iata: string) => {
    setRouteDraftDestination(iata);
    setTab("routes");
    setNotice(`Planning ${airline.hub}–${iata}. Pick an aircraft, frequency and fare to open the route.`);
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
          <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-sm capitalize ${tab === item ? "bg-slate-700 text-white" : "text-[var(--muted)] hover:text-white"}`}>
            {item === "overview" ? "Map" : item}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview airline={airline} results={results} onPlanRoute={planRouteFromMap} />}
      {tab === "fleet" && <Fleet airline={airline} setAirline={setAirline} setNotice={setNotice} />}
      {tab === "routes" && <Routes airline={airline} setAirline={setAirline} setNotice={setNotice} results={results} initialDestination={routeDraftDestination} />}
    </main>
  );
}

function Onboarding({ onCreate }: { onCreate: (airline: Airline) => void }) {
  const [name, setName] = useState("Continental");
  const [code, setCode] = useState("CO");
  const [hub, setHub] = useState("PHX");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">Airline Simulator · v0.2</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl">Build the network. Watch it move.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted)]">Start with $25M, pick a real-world airport, lease aircraft, open routes, and watch your airline spread across the map.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Real airport coordinates</span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Great-circle routes</span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Live aircraft visualization</span>
          </div>
        </section>
        <form className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5" onSubmit={(event) => {
          event.preventDefault();
          onCreate({ name: name.trim() || "New Airline", code: (code.trim() || "NA").slice(0, 3).toUpperCase(), hub, cash: STARTING_CASH, reputation: 50, day: 1, fleet: [], routes: [], lifetimeProfit: 0 });
        }}>
          <h2 className="text-lg font-semibold">Create airline</h2>
          <label className="mt-5 block text-sm text-[var(--muted)]">Airline name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white outline-none focus:border-sky-300" /></label>
          <label className="mt-4 block text-sm text-[var(--muted)]">Code<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={3} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 uppercase text-white outline-none focus:border-sky-300" /></label>
          <div className="mt-4"><AirportPicker label="Starting hub" value={hub} onChange={setHub} /></div>
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

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-semibold">Aircraft market</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Lease deposit is two months.</p>
        <div className="mt-4 space-y-2">
          {aircraftTypes.map((type) => (
            <div key={type.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <div><div className="font-medium">{type.manufacturer} {type.model}</div><div className="text-xs text-[var(--muted)]">{type.seats} seats · {type.rangeKm.toLocaleString()} km · {money(type.monthlyLease)}/mo</div></div>
              <button onClick={() => lease(type.id)} className="rounded-md border border-sky-400/40 px-3 py-2 text-sm text-sky-200 hover:bg-sky-400/10">Lease</button>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-semibold">Your fleet</h2>
        <div className="mt-4 space-y-2">
          {airline.fleet.length === 0 ? <p className="text-sm text-[var(--muted)]">No aircraft yet.</p> : airline.fleet.map((aircraft) => {
            const type = aircraftTypeById(aircraft.typeId);
            const assigned = airline.routes.find((route) => route.aircraftId === aircraft.id);
            return (
              <div key={aircraft.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-800 text-xs font-semibold">{type?.manufacturer.slice(0, 1)}</div>
                <div><div className="font-medium">{aircraft.registration} · {type?.model}</div><div className="text-xs text-[var(--muted)]">Condition {aircraft.condition}% · {assigned ? `${assigned.origin}–${assigned.destination}` : "Unassigned"}</div></div>
                <div className="font-mono text-xs text-[var(--muted)]">{type?.seats} seats</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Routes({ airline, setAirline, setNotice, results, initialDestination }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void; results: RouteResult[]; initialDestination: string | null }) {
  const freeAircraft = airline.fleet.filter((aircraft) => !airline.routes.some((route) => route.aircraftId === aircraft.id));
  const fallbackDestination = airports.find((airport) => airport.iata !== airline.hub)?.iata ?? "LAX";
  const [destination, setDestination] = useState(initialDestination && initialDestination !== airline.hub ? initialDestination : fallbackDestination);
  const [aircraftId, setAircraftId] = useState(freeAircraft[0]?.id ?? "");
  const [frequency, setFrequency] = useState(14);
  const [fare, setFare] = useState(149);

  useEffect(() => {
    if (initialDestination && initialDestination !== airline.hub && airportByIata(initialDestination)) setDestination(initialDestination);
  }, [airline.hub, initialDestination]);

  useEffect(() => {
    if (!aircraftId && freeAircraft[0]) setAircraftId(freeAircraft[0].id);
  }, [aircraftId, freeAircraft]);

  const selectedAircraft = airline.fleet.find((item) => item.id === aircraftId);
  const selectedType = selectedAircraft ? aircraftTypeById(selectedAircraft.typeId) : undefined;
  const distance = distanceKm(airline.hub, destination);
  const demand = estimateDailyDemand(airline.hub, destination);
  const destinationAirport = airportByIata(destination);

  const createRoute = () => {
    if (!destinationAirport) return setNotice("Choose a valid destination airport.");
    if (destination === airline.hub) return setNotice("Choose an airport other than your hub.");
    if (airline.routes.some((route) => route.origin === airline.hub && route.destination === destination)) return setNotice(`${airline.hub}–${destination} is already in your network.`);
    if (!aircraftId) return setNotice("Lease an aircraft first, or choose an unassigned aircraft.");
    if (!selectedType) return setNotice("Aircraft type could not be resolved.");
    if (distance > selectedType.rangeKm) return setNotice(`${selectedType.model} does not have enough range for this route.`);
    const route = { id: crypto.randomUUID(), origin: airline.hub, destination, aircraftId, weeklyFrequency: Math.max(1, Math.min(35, frequency)), economyFare: Math.max(39, fare) };
    setAirline((current) => current ? { ...current, routes: [...current.routes, route] } : current);
    setAircraftId("");
    setNotice(`${airline.hub}–${destination} opened with ${route.weeklyFrequency} weekly flights.`);
  };

  const resultFor = (routeId: string) => results.find((result) => result.routeId === routeId);

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-semibold">Open route</h2>
        <div className="mt-4"><AirportPicker label="Destination" value={destination} onChange={setDestination} excludeIata={airline.hub} /></div>
        <label className="mt-4 block text-sm text-[var(--muted)]">Aircraft<select value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white"><option value="">Select aircraft</option>{freeAircraft.map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} — {aircraftTypeById(aircraft.typeId)?.model}</option>)}</select></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm text-[var(--muted)]">Weekly flights<input type="number" min="1" max="35" value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white" /></label><label className="text-sm text-[var(--muted)]">Economy fare<input type="number" min="39" value={fare} onChange={(event) => setFare(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-white" /></label></div>
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm"><div className="flex justify-between"><span className="text-[var(--muted)]">Distance</span><span>{distance.toLocaleString()} km</span></div><div className="mt-2 flex justify-between"><span className="text-[var(--muted)]">Estimated market</span><span>{demand.toLocaleString()} pax/day</span></div><div className="mt-2 flex justify-between"><span className="text-[var(--muted)]">Range check</span><span className={selectedType && distance <= selectedType.rangeKm ? "text-green-300" : "text-[var(--muted)]"}>{selectedType ? (distance <= selectedType.rangeKm ? "PASS" : "FAIL") : "—"}</span></div></div>
        <button onClick={createRoute} className="mt-4 w-full rounded-lg bg-sky-300 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-200">Open route</button>
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-semibold">Route performance</h2>
        <div className="mt-4 space-y-2">{airline.routes.length === 0 ? <p className="text-sm text-[var(--muted)]">No routes yet.</p> : airline.routes.map((route) => {
          const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
          const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
          const result = resultFor(route.id);
          return (
            <div key={route.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-lg">{route.origin} → {route.destination}</div><div className="mt-1 text-xs text-[var(--muted)]">{type?.model} · {route.weeklyFrequency}× weekly · fare {money(route.economyFare)}</div></div>{result && <div className={`text-right ${result.profit >= 0 ? "text-green-300" : "text-rose-300"}`}><div className="font-mono font-semibold">{result.profit >= 0 ? "+" : ""}{money(result.profit)}</div><div className="text-xs opacity-70">last day</div></div>}</div>
              {result && <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="text-[var(--muted)]">Flights</span><div className="mt-1 text-sm">{result.flights}</div></div><div><span className="text-[var(--muted)]">Passengers</span><div className="mt-1 text-sm">{result.passengers}</div></div><div><span className="text-[var(--muted)]">Load factor</span><div className="mt-1 text-sm">{pct(result.loadFactor)}</div></div></div>}
            </div>
          );
        })}</div>
      </section>
    </div>
  );
}

function AirportPicker({ label, value, onChange, excludeIata }: { label: string; value: string; onChange: (iata: string) => void; excludeIata?: string }) {
  const [search, setSearch] = useState("");
  const selected = airportByIata(value);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return airports
      .filter((airport) => airport.iata !== excludeIata)
      .filter((airport) => `${airport.iata} ${airport.icao ?? ""} ${airport.city} ${airport.name} ${airport.country}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const aCode = a.iata.toLowerCase().startsWith(query) ? 0 : 1;
        const bCode = b.iata.toLowerCase().startsWith(query) ? 0 : 1;
        if (aCode !== bCode) return aCode - bCode;
        const aLarge = a.type === "large_airport" ? 0 : 1;
        const bLarge = b.type === "large_airport" ? 0 : 1;
        if (aLarge !== bLarge) return aLarge - bLarge;
        return a.iata.localeCompare(b.iata);
      })
      .slice(0, 40);
  }, [excludeIata, search]);

  return (
    <div>
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div><div className="font-mono text-lg text-white">{selected?.iata ?? value}</div><div className="text-xs text-[var(--muted)]">{selected ? `${selected.city} · ${selected.name}` : "Search for an airport below"}</div></div>
          {selected?.icao && <div className="font-mono text-xs text-[var(--muted)]">{selected.icao}</div>}
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IATA, ICAO, city or airport…" className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-300" />
        {search.trim() && (
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-1">
            {matches.length === 0 ? <div className="px-2 py-3 text-sm text-[var(--muted)]">No mapped airport found.</div> : matches.map((airport) => (
              <button key={airport.iata} type="button" onClick={() => { onChange(airport.iata); setSearch(""); }} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-800">
                <div><div className="font-mono text-sm text-white">{airport.iata} <span className="font-sans text-[var(--muted)]">· {airport.city}</span></div><div className="mt-0.5 truncate text-xs text-[var(--muted)]">{airport.name}</div></div>
                <div className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">{airport.country}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
