export type CabinClass = "economy" | "business";

export type Airport = {
  iata: string;
  city: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  demand: number;
};

export type AircraftType = {
  id: string;
  manufacturer: "Airbus" | "Boeing" | "Embraer";
  model: string;
  seats: number;
  rangeKm: number;
  cruiseKmh: number;
  monthlyLease: number;
  fuelCostPerKm: number;
  maintenancePerFlight: number;
};

export type OwnedAircraft = {
  id: string;
  typeId: string;
  registration: string;
  condition: number;
};

export type Route = {
  id: string;
  origin: string;
  destination: string;
  aircraftId: string;
  weeklyFrequency: number;
  economyFare: number;
};

export type Airline = {
  name: string;
  code: string;
  hub: string;
  cash: number;
  reputation: number;
  day: number;
  fleet: OwnedAircraft[];
  routes: Route[];
  lifetimeProfit: number;
};

export type RouteResult = {
  routeId: string;
  flights: number;
  passengers: number;
  loadFactor: number;
  revenue: number;
  costs: number;
  profit: number;
};
