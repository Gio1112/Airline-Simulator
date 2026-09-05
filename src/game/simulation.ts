import { aircraftTypeById, airportByIata } from "./data";
import type { Airline, Route, RouteResult } from "./types";

const EARTH_RADIUS_KM = 6371;

export function distanceKm(aIata: string, bIata: string) {
  const a = airportByIata(aIata);
  const b = airportByIata(bIata);
  if (!a || !b) return 0;

  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function estimateDailyDemand(origin: string, destination: string) {
  const a = airportByIata(origin);
  const b = airportByIata(destination);
  if (!a || !b) return 0;
  const distance = distanceKm(origin, destination);
  const size = (a.demand + b.demand) / 2;
  const distanceFactor = Math.max(0.5, Math.min(1.15, 1.1 - distance / 18000));
  return Math.round(size * 8.5 * distanceFactor);
}

function routeFlightsToday(route: Route, day: number) {
  const base = Math.floor(route.weeklyFrequency / 7);
  const remainder = route.weeklyFrequency % 7;
  return base + ((day - 1) % 7 < remainder ? 1 : 0);
}

export function simulateRouteDay(airline: Airline, route: Route): RouteResult {
  const owned = airline.fleet.find((aircraft) => aircraft.id === route.aircraftId);
  const type = owned ? aircraftTypeById(owned.typeId) : undefined;
  if (!type) return { routeId: route.id, flights: 0, passengers: 0, loadFactor: 0, revenue: 0, costs: 0, profit: 0 };

  const distance = distanceKm(route.origin, route.destination);
  const flights = routeFlightsToday(route, airline.day);
  const seats = flights * type.seats;
  const marketDemand = estimateDailyDemand(route.origin, route.destination);
  const normalFare = 55 + distance * 0.105;
  const priceScore = Math.max(0.45, Math.min(1.25, normalFare / route.economyFare));
  const reputationScore = 0.75 + airline.reputation / 200;
  const frequencyScore = Math.min(1.18, 0.82 + route.weeklyFrequency / 80);
  const capture = Math.min(0.72, 0.22 * priceScore * reputationScore * frequencyScore);
  const passengers = Math.max(0, Math.min(seats, Math.round(marketDemand * capture)));
  const loadFactor = seats ? passengers / seats : 0;

  const revenue = Math.round(passengers * route.economyFare);
  const fuel = flights * distance * type.fuelCostPerKm;
  const airportFees = flights * (650 + type.seats * 2.2);
  const crewAndHandling = flights * (900 + type.seats * 5.5);
  const maintenance = flights * type.maintenancePerFlight;
  const dailyLease = type.monthlyLease / 30;
  const costs = Math.round(fuel + airportFees + crewAndHandling + maintenance + dailyLease);

  return {
    routeId: route.id,
    flights,
    passengers,
    loadFactor,
    revenue,
    costs,
    profit: revenue - costs,
  };
}

export function simulateDay(airline: Airline) {
  const results = airline.routes.map((route) => simulateRouteDay(airline, route));
  const profit = results.reduce((sum, result) => sum + result.profit, 0);
  return { results, profit };
}
