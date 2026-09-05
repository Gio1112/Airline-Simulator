"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { NetworkMap } from "@/components/network-map";
import { aircraftTypeById, aircraftTypes, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand, simulateDay } from "@/game/simulation";
import type { Airline, RouteResult } from "@/game/types";

const STARTING_CASH = 25_000_000;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;
type AirlineSetter = Dispatch<SetStateAction<Airline | null>>;
type Panel = "fleet" | "routes" | "stats" | "selection" | null;

export function GameShell() {
  const [airline, setAirline] = useState<Airline | null>(null);
  const [results, setResults] = useState<RouteResult[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [routeDraftDestination, setRouteDraftDestination] = useState<string | null>(null);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showAirports, setShowAirports] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState("Ready for operations.");

  const searchMatches = useMemo(() => airportMatches(searchQuery, 9), [searchQuery]);

  if (!airline) return <Onboarding onCreate={setAirline} />;

  const todayProfit = results.reduce((sum, item) => sum + item.profit, 0);
  const passengers = results.reduce((sum, item) => sum + item.passengers, 0);
  const weeklyFlights = airline.routes.reduce((sum, route) => sum + route.weeklyFrequency, 0);
  const activeAircraft = new Set(airline.routes.map((route) => route.aircraftId)).size;
  const selectedAirport = selectedAirportCode ? airportByIata(selectedAirportCode) : undefined;
  const selectedRoute = selectedRouteId ? airline.routes.find((route) => route.id === selectedRouteId) : undefined;

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
    setNotice(`Day ${airline.day}: ${outcome.profit >= 0 ? "+" : ""}${money(outcome.profit)} operating result.`);
  };

  const openPanel = (next: Exclude<Panel, "selection" | null>) => {
    setPanel((current) => current === next ? null : next);
  };

  const selectAirport = (iata: string) => {
    setSelectedAirportCode(iata);
    setSelectedRouteId(null);
    setPanel("selection");
  };

  const selectRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedAirportCode(null);
    setPanel("selection");
  };

  const closePanel = () => {
    setPanel(null);
    if (selectedAirportCode || selectedRouteId) {
      setSelectedAirportCode(null);
      setSelectedRouteId(null);
    }
  };

  const planRoute = (iata: string) => {
    if (iata === airline.hub) return;
    setRouteDraftDestination(iata);
    setPanel("routes");
    setNotice(`Planning ${airline.hub}–${iata}.`);
  };

  const chooseSearchAirport = (iata: string) => {
    const airport = airportByIata(iata);
    if (!airport) return;
    setSearchQuery(`${airport.iata} — ${airport.city}`);
    setSearchOpen(false);
    selectAirport(iata);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#dce5e8]">
      <NetworkMap
        airline={airline}
        results={results}
        selectedAirportCode={selectedAirportCode}
        selectedRouteId={selectedRouteId}
        onSelectAirport={selectAirport}
        onSelectRoute={selectRoute}
        showAirports={showAirports}
      />

      <header className="pointer-events-auto absolute inset-x-0 top-0 z-[1200] flex h-14 items-center border-b border-white/10 bg-[#151a20]/95 px-2 text-white shadow-xl backdrop-blur-md sm:px-3">
        <div className="flex min-w-0 items-center gap-2 sm:w-[310px]">
          <div className="grid h-9 min-w-9 place-items-center rounded bg-[#f4c430] px-2 font-mono text-sm font-black text-[#11161b] shadow-sm">
            {airline.code}
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold leading-4">{airline.name}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">Operations control</div>
          </div>
        </div>

        <div className="relative mx-2 flex max-w-2xl flex-1 sm:mx-4">
          <form className="w-full" onSubmit={(event) => {
            event.preventDefault();
            if (searchMatches[0]) chooseSearchAirport(searchMatches[0].iata);
          }}>
            <div className="flex h-9 items-center rounded-md border border-white/10 bg-[#0e1318] shadow-inner focus-within:border-[#f4c430]/70">
              <span className="pl-3 text-sm text-slate-500">⌕</span>
              <input
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
                placeholder="Search airport, city or IATA"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="h-full px-3 text-slate-500 hover:text-white">×</button>}
            </div>
          </form>

          {searchOpen && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-11 overflow-hidden rounded-md border border-white/10 bg-[#151a20]/98 shadow-2xl backdrop-blur-xl">
              {searchMatches.length ? searchMatches.map((airport) => (
                <button
                  type="button"
                  key={airport.iata}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSearchAirport(airport.iata)}
                  className="flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left last:border-0 hover:bg-white/5"
                >
                  <span className="w-10 font-mono text-sm font-bold text-[#f4c430]">{airport.iata}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{airport.city}</span>
                    <span className="block truncate text-[11px] text-slate-400">{airport.name}</span>
                  </span>
                  <span className="text-[10px] uppercase text-slate-500">{airport.country}</span>
                </button>
              )) : <div className="px-4 py-5 text-center text-sm text-slate-500">No airports found.</div>}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <div className="hidden text-right lg:block">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Cash</div>
            <div className="font-mono text-sm font-semibold">{money(airline.cash)}</div>
          </div>
          <div className="hidden h-7 w-px bg-white/10 lg:block" />
          <div className="hidden text-right md:block">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Simulation</div>
            <div className="text-xs">Day {airline.day}</div>
          </div>
          <button onClick={advanceDay} className="ml-1 rounded bg-[#f4c430] px-3 py-2 text-xs font-bold text-[#11161b] shadow-sm hover:bg-[#ffda4d] sm:px-4">
            Advance day
          </button>
        </div>
      </header>

      <aside className="pointer-events-auto absolute left-2 top-[68px] z-[1100] flex w-12 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#151a20]/95 shadow-2xl backdrop-blur-md">
        <RailButton label="Fleet" icon="✈" active={panel === "fleet"} onClick={() => openPanel("fleet")} />
        <RailButton label="Routes" icon="↗" active={panel === "routes"} onClick={() => openPanel("routes")} />
        <RailButton label="Stats" icon="▥" active={panel === "stats"} onClick={() => openPanel("stats")} />
        <div className="h-px bg-white/10" />
        <RailButton label={showAirports ? "Hide airports" : "Show airports"} icon="⊙" active={showAirports} onClick={() => setShowAirports((value) => !value)} />
      </aside>

      {panel && (
        <section className="pointer-events-auto absolute bottom-3 left-2 right-2 top-[68px] z-[1050] flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#151a20]/96 text-white shadow-2xl backdrop-blur-xl sm:left-[68px] sm:right-auto sm:w-[410px]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Airline control</div>
              <div className="text-sm font-semibold">{panelTitle(panel, selectedAirport?.iata, selectedRoute ? `${selectedRoute.origin} → ${selectedRoute.destination}` : undefined)}</div>
            </div>
            <button onClick={closePanel} className="grid h-8 w-8 place-items-center rounded text-xl text-slate-400 hover:bg-white/5 hover:text-white">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === "fleet" && <FleetPanel airline={airline} setAirline={setAirline} setNotice={setNotice} />}
            {panel === "routes" && (
              <RoutesPanel
                airline={airline}
                setAirline={setAirline}
                setNotice={setNotice}
                results={results}
                requestedDestination={routeDraftDestination}
                onDestinationConsumed={() => setRouteDraftDestination(null)}
                onInspectRoute={selectRoute}
              />
            )}
            {panel === "stats" && <StatsPanel airline={airline} results={results} />}
            {panel === "selection" && (
              <SelectionPanel
                airline={airline}
                results={results}
                airportCode={selectedAirportCode}
                routeId={selectedRouteId}
                onPlanRoute={planRoute}
              />
            )}
          </div>
        </section>
      )}

      <div className="pointer-events-none absolute bottom-3 left-[68px] z-[900] hidden items-center gap-2 rounded-md border border-black/10 bg-[#151a20]/88 px-3 py-2 text-[11px] text-white shadow-lg backdrop-blur-md sm:flex">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#f4c430]" />LIVE</span>
        <span className="text-slate-500">|</span>
        <span>Hub <b>{airline.hub}</b></span>
        <span className="text-slate-500">|</span>
        <span>{airline.routes.length} routes</span>
        <span className="text-slate-500">|</span>
        <span>{weeklyFlights} flights/week</span>
        <span className="text-slate-500">|</span>
        <span>{airports.length.toLocaleString()} airports</span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-[900] max-w-[45vw] -translate-x-1/2 rounded-md border border-black/10 bg-white/92 px-3 py-2 text-center text-[11px] font-medium text-slate-700 shadow-lg backdrop-blur-md">
        {notice}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-14 z-[900] hidden rounded-md border border-black/10 bg-white/92 px-3 py-2 text-[10px] text-slate-700 shadow-lg backdrop-blur-md md:flex md:gap-3">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f4c430]" />Hub</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-600" />Network</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 bg-green-600 align-middle" />Profit</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 bg-rose-600 align-middle" />Loss</span>
      </div>
    </main>
  );
}

function RailButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-12 place-items-center border-b border-white/5 text-lg transition last:border-0 ${active ? "bg-[#f4c430] text-[#11161b]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
    >
      {icon}
    </button>
  );
}

function panelTitle(panel: Panel, airport?: string, route?: string) {
  if (panel === "fleet") return "Fleet";
  if (panel === "routes") return "Routes";
  if (panel === "stats") return "Airline performance";
  if (route) return route;
  if (airport) return airport;
  return "Map selection";
}

function SelectionPanel({ airline, results, airportCode, routeId, onPlanRoute }: { airline: Airline; results: RouteResult[]; airportCode: string | null; routeId: string | null; onPlanRoute: (iata: string) => void }) {
  const airport = airportCode ? airportByIata(airportCode) : undefined;
  const route = routeId ? airline.routes.find((item) => item.id === routeId) : undefined;
  const result = route ? results.find((item) => item.routeId === route.id) : undefined;

  if (airport) {
    const servedRoute = airline.routes.find((item) => item.destination === airport.iata || item.origin === airport.iata);
    return (
      <div>
        <div className="border-b border-white/10 bg-[#0f1419] px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-4xl font-semibold tracking-tight">{airport.iata}</div>
              <div className="mt-1 text-xs text-slate-500">{airport.icao ?? ""}</div>
            </div>
            <div className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${servedRoute ? "bg-green-400/15 text-green-300" : "bg-white/5 text-slate-400"}`}>{servedRoute ? "Served" : "Unserved"}</div>
          </div>
          <div className="mt-4 text-base font-semibold">{airport.name}</div>
          <div className="mt-1 text-sm text-slate-400">{airport.city} · {airport.country}</div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <InfoCell label="Distance from hub" value={airport.iata === airline.hub ? "Hub" : `${distanceKm(airline.hub, airport.iata).toLocaleString()} km`} />
          <InfoCell label="Estimated market" value={`${estimateDailyDemand(airline.hub, airport.iata).toLocaleString()} pax/day`} />
          <InfoCell label="Airport class" value={airport.type === "large_airport" ? "Large" : "Medium"} />
          <InfoCell label="Network status" value={servedRoute ? "In network" : "Not served"} />
        </div>
        {airport.iata !== airline.hub && (
          <div className="p-4">
            <button onClick={() => onPlanRoute(airport.iata)} className="w-full rounded bg-[#f4c430] px-4 py-3 text-sm font-bold text-[#11161b] hover:bg-[#ffda4d]">Plan {airline.hub} → {airport.iata}</button>
          </div>
        )}
      </div>
    );
  }

  if (route) {
    const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
    const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
    return (
      <div>
        <div className="border-b border-white/10 bg-[#0f1419] px-5 py-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f4c430]">{airline.code} network</div>
          <div className="mt-2 flex items-center gap-3 font-mono text-3xl font-semibold">
            <span>{route.origin}</span><span className="text-slate-600">→</span><span>{route.destination}</span>
          </div>
          <div className="mt-2 text-sm text-slate-400">{aircraft?.registration ?? "Aircraft"} · {type ? `${type.manufacturer} ${type.model}` : "Unknown type"}</div>
        </div>
        <div className="p-4">
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${result ? (result.loadFactor >= 0.8 ? "bg-green-400" : result.loadFactor >= 0.6 ? "bg-[#f4c430]" : "bg-rose-400") : "bg-sky-400"}`} style={{ width: `${result ? Math.max(4, Math.round(result.loadFactor * 100)) : 12}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Distance" value={`${distanceKm(route.origin, route.destination).toLocaleString()} km`} />
            <MiniStat label="Frequency" value={`${route.weeklyFrequency}× weekly`} />
            <MiniStat label="Fare" value={money(route.economyFare)} />
            <MiniStat label="Load factor" value={result ? pct(result.loadFactor) : "Not simulated"} />
            <MiniStat label="Passengers" value={result ? result.passengers.toLocaleString() : "—"} />
            <MiniStat label="Last result" value={result ? money(result.profit) : "—"} accent={result ? (result.profit >= 0 ? "good" : "bad") : undefined} />
          </div>
        </div>
      </div>
    );
  }

  return <EmptyState>Select an airport or route on the map.</EmptyState>;
}

function StatsPanel({ airline, results }: { airline: Airline; results: RouteResult[] }) {
  const dayProfit = results.reduce((sum, item) => sum + item.profit, 0);
  const passengers = results.reduce((sum, item) => sum + item.passengers, 0);
  const flights = results.reduce((sum, item) => sum + item.flights, 0);
  const activeAircraft = new Set(airline.routes.map((route) => route.aircraftId)).size;
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Fleet" value={airline.fleet.length.toString()} helper={`${activeAircraft} assigned`} />
        <MiniStat label="Routes" value={airline.routes.length.toString()} helper={`${airline.routes.reduce((sum, route) => sum + route.weeklyFrequency, 0)} weekly flights`} />
        <MiniStat label="Passengers" value={passengers.toLocaleString()} helper={`${flights} flights last day`} />
        <MiniStat label="Day result" value={money(dayProfit)} accent={dayProfit >= 0 ? "good" : "bad"} />
        <MiniStat label="Lifetime result" value={money(airline.lifetimeProfit)} accent={airline.lifetimeProfit >= 0 ? "good" : "bad"} />
        <MiniStat label="Reputation" value={airline.reputation.toFixed(1)} helper="out of 100" />
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-[#0e1318] p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Network summary</div>
        <div className="mt-3 space-y-2 text-sm">
          <DataRow label="Home base" value={airline.hub} />
          <DataRow label="Available cash" value={money(airline.cash)} />
          <DataRow label="Simulation day" value={airline.day.toString()} />
          <DataRow label="Mapped airports" value={airports.length.toLocaleString()} />
        </div>
      </div>
    </div>
  );
}

function FleetPanel({ airline, setAirline, setNotice }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void }) {
  const lease = (typeId: string) => {
    const type = aircraftTypeById(typeId);
    if (!type) return;
    const deposit = type.monthlyLease * 2;
    if (airline.cash < deposit) return setNotice("Not enough cash for the two-month lease deposit.");
    const number = airline.fleet.length + 1;
    const aircraft = { id: crypto.randomUUID(), typeId, registration: `N${300 + number}${airline.code.slice(0, 2)}`, condition: 100 };
    setAirline((current) => current ? { ...current, cash: current.cash - deposit, fleet: [...current.fleet, aircraft] } : current);
    setNotice(`${type.model} leased · ${money(deposit)} deposit.`);
  };

  return (
    <div className="p-4">
      <SectionLabel>Aircraft market</SectionLabel>
      <div className="mt-2 space-y-2">
        {aircraftTypes.map((type) => (
          <div key={type.id} className="rounded-md border border-white/10 bg-[#0e1318] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{type.manufacturer} {type.model}</div>
                <div className="mt-1 text-[11px] text-slate-500">{type.seats} seats · {type.rangeKm.toLocaleString()} km</div>
              </div>
              <button onClick={() => lease(type.id)} className="rounded border border-[#f4c430]/40 px-2.5 py-1.5 text-[11px] font-bold text-[#f4c430] hover:bg-[#f4c430]/10">LEASE</button>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-xs">
              <span className="text-slate-500">Monthly lease</span><span className="font-mono">{money(type.monthlyLease)}</span>
            </div>
          </div>
        ))}
      </div>

      <SectionLabel className="mt-6">Your fleet</SectionLabel>
      <div className="mt-2 space-y-2">
        {airline.fleet.length === 0 ? <EmptyState>No aircraft yet.</EmptyState> : airline.fleet.map((aircraft) => {
          const type = aircraftTypeById(aircraft.typeId);
          const assigned = airline.routes.find((route) => route.aircraftId === aircraft.id);
          return (
            <div key={aircraft.id} className="rounded-md border border-white/10 bg-[#0e1318] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-semibold">{aircraft.registration}</div>
                  <div className="mt-1 text-xs text-slate-400">{type?.manufacturer} {type?.model}</div>
                </div>
                <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${assigned ? "bg-sky-400/10 text-sky-300" : "bg-white/5 text-slate-500"}`}>{assigned ? `${assigned.origin}–${assigned.destination}` : "Unassigned"}</span>
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-slate-500"><span>Condition {aircraft.condition}%</span><span>{type?.seats} seats</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoutesPanel({ airline, setAirline, setNotice, results, requestedDestination, onDestinationConsumed, onInspectRoute }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void; results: RouteResult[]; requestedDestination: string | null; onDestinationConsumed: () => void; onInspectRoute: (routeId: string) => void }) {
  const freeAircraft = useMemo(() => airline.fleet.filter((aircraft) => !airline.routes.some((route) => route.aircraftId === aircraft.id)), [airline.fleet, airline.routes]);
  const initialDestination = airports.find((airport) => airport.iata !== airline.hub)?.iata ?? "LAX";
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
  const destinationMatches = useMemo(() => airportMatches(destinationQuery, 10).filter((airport) => airport.iata !== airline.hub), [airline.hub, destinationQuery]);

  const createRoute = () => {
    if (!aircraftId) return setNotice("Lease an aircraft first, or choose an unassigned aircraft.");
    if (!selectedType) return setNotice("Aircraft type could not be resolved.");
    if (airline.routes.some((route) => route.origin === airline.hub && route.destination === destination)) return setNotice("You already operate that route.");
    if (distance > selectedType.rangeKm) return setNotice(`${selectedType.model} does not have enough range for this route.`);
    const route = { id: crypto.randomUUID(), origin: airline.hub, destination, aircraftId, weeklyFrequency: Math.max(1, Math.min(35, frequency)), economyFare: Math.max(39, fare) };
    setAirline((current) => current ? { ...current, routes: [...current.routes, route] } : current);
    setAircraftId("");
    setNotice(`${airline.hub}–${destination} opened · ${route.weeklyFrequency} weekly flights.`);
  };

  const resultFor = (routeId: string) => results.find((result) => result.routeId === routeId);

  return (
    <div className="p-4">
      <SectionLabel>Open route</SectionLabel>
      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Destination</label>
      <input value={destinationQuery} onChange={(event) => setDestinationQuery(event.target.value)} placeholder="Search airport" className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f4c430]/70" />
      <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-white/10 bg-[#0e1318]">
        {destinationMatches.map((airport) => (
          <button type="button" key={airport.iata} onClick={() => { setDestination(airport.iata); setDestinationQuery(`${airport.iata} — ${airport.city}`); }} className={`flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-xs last:border-0 ${destination === airport.iata ? "bg-[#f4c430]/10 text-[#f4c430]" : "text-slate-300 hover:bg-white/5"}`}>
            <span><span className="font-mono font-bold">{airport.iata}</span> · {airport.city}</span><span className="text-slate-600">{airport.country}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Aircraft
          <select value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-2 py-2.5 text-sm normal-case tracking-normal text-white outline-none">
            <option value="">Select</option>
            {freeAircraft.map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} · {aircraftTypeById(aircraft.typeId)?.model}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Flights / week
          <input type="number" min="1" max="35" value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none" />
        </label>
      </div>
      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Economy fare
        <input type="number" min="39" value={fare} onChange={(event) => setFare(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none" />
      </label>

      <div className="mt-3 rounded-md border border-white/10 bg-[#0e1318] p-3 text-xs">
        <DataRow label="Route" value={`${airline.hub} → ${destination}`} />
        <DataRow label="Distance" value={`${distance.toLocaleString()} km`} />
        <DataRow label="Market" value={`${demand.toLocaleString()} pax/day`} />
        <DataRow label="Range" value={selectedType ? (distance <= selectedType.rangeKm ? "PASS" : "FAIL") : "—"} valueClass={selectedType ? (distance <= selectedType.rangeKm ? "text-green-300" : "text-rose-300") : ""} />
      </div>
      <button onClick={createRoute} className="mt-3 w-full rounded bg-[#f4c430] px-4 py-3 text-sm font-bold text-[#11161b] hover:bg-[#ffda4d]">Open route</button>

      <SectionLabel className="mt-6">Your routes</SectionLabel>
      <div className="mt-2 space-y-2">
        {airline.routes.length === 0 ? <EmptyState>No routes yet.</EmptyState> : airline.routes.map((route) => {
          const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
          const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
          const result = resultFor(route.id);
          return (
            <button key={route.id} onClick={() => onInspectRoute(route.id)} className="w-full rounded-md border border-white/10 bg-[#0e1318] p-3 text-left hover:border-white/20 hover:bg-[#121920]">
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-mono text-sm font-semibold">{route.origin} → {route.destination}</div><div className="mt-1 text-[11px] text-slate-500">{type?.model} · {route.weeklyFrequency}× weekly</div></div>
                {result && <div className={`font-mono text-xs font-semibold ${result.profit >= 0 ? "text-green-300" : "text-rose-300"}`}>{result.profit >= 0 ? "+" : ""}{money(result.profit)}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Onboarding({ onCreate }: { onCreate: (airline: Airline) => void }) {
  const [name, setName] = useState("Continental");
  const [code, setCode] = useState("CO");
  const [hub, setHub] = useState("PHX");
  const [hubQuery, setHubQuery] = useState("PHX");
  const hubMatches = useMemo(() => airportMatches(hubQuery, 10), [hubQuery]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#11161b] p-4 text-white">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-[#151a20]/95 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.15fr_.85fr]">
        <section className="border-b border-white/10 p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div className="inline-flex items-center gap-2 rounded bg-[#f4c430] px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11161b]">Airline Simulator · Live map</div>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">Build the network from the map.</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-400">Choose a real airport as your hub, lease aircraft, build routes and run the airline from one live operations interface.</p>
          <div className="mt-8 grid grid-cols-3 gap-2 text-center">
            <IntroStat value={airports.length.toLocaleString()} label="Airports" />
            <IntroStat value="$25M" label="Starting cash" />
            <IntroStat value="Live" label="Network map" />
          </div>
        </section>
        <form className="p-6 sm:p-8" onSubmit={(event) => {
          event.preventDefault();
          onCreate({ name: name.trim() || "New Airline", code: (code.trim() || "NA").slice(0, 3).toUpperCase(), hub, cash: STARTING_CASH, reputation: 50, day: 1, fleet: [], routes: [], lifetimeProfit: 0 });
        }}>
          <div className="text-sm font-semibold">Create airline</div>
          <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Airline name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-[#f4c430]/70" /></label>
          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Code<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={3} className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm uppercase tracking-normal text-white outline-none focus:border-[#f4c430]/70" /></label>
          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Starting hub<input value={hubQuery} onChange={(event) => setHubQuery(event.target.value)} placeholder="IATA, city or airport" className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0e1318] px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-[#f4c430]/70" /></label>
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-white/10 bg-[#0e1318]">
            {hubMatches.map((airport) => <button type="button" key={airport.iata} onClick={() => { setHub(airport.iata); setHubQuery(`${airport.iata} — ${airport.city}`); }} className={`flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-xs last:border-0 ${hub === airport.iata ? "bg-[#f4c430]/10 text-[#f4c430]" : "text-slate-300 hover:bg-white/5"}`}><span><span className="font-mono font-bold">{airport.iata}</span> · {airport.city}</span><span className="ml-3 truncate text-slate-600">{airport.country}</span></button>)}
          </div>
          <button className="mt-5 w-full rounded bg-[#f4c430] px-4 py-3 text-sm font-black text-[#11161b] hover:bg-[#ffda4d]">Launch airline</button>
        </form>
      </div>
    </main>
  );
}

function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 ${className}`}>{children}</div>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#151a20] p-4"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>;
}

function MiniStat({ label, value, helper, accent }: { label: string; value: string; helper?: string; accent?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#0e1318] p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${accent === "good" ? "text-green-300" : accent === "bad" ? "text-rose-300" : "text-white"}`}>{value}</div>
      {helper && <div className="mt-1 text-[10px] text-slate-600">{helper}</div>}
    </div>
  );
}

function DataRow({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-0"><span className="text-slate-500">{label}</span><span className={`text-right font-medium ${valueClass}`}>{value}</span></div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

function IntroStat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-md border border-white/10 bg-white/5 p-3"><div className="font-mono text-lg font-semibold">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div></div>;
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
