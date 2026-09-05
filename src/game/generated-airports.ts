import type { Airport } from "./types";

// Fallback airport data committed so local development and builds still work
// if the upstream airport-data sync is unavailable. `npm run sync-airports`
// replaces this module with a larger OurAirports-derived dataset.
export const generatedAirports: Airport[] = [
  { iata: "PHX", icao: "KPHX", city: "Phoenix", name: "Phoenix Sky Harbor International Airport", country: "US", lat: 33.4342, lon: -112.0116, demand: 88, type: "large_airport" },
  { iata: "LAX", icao: "KLAX", city: "Los Angeles", name: "Los Angeles International Airport", country: "US", lat: 33.9416, lon: -118.4085, demand: 100, type: "large_airport" },
  { iata: "LAS", icao: "KLAS", city: "Las Vegas", name: "Harry Reid International Airport", country: "US", lat: 36.0840, lon: -115.1537, demand: 82, type: "large_airport" },
  { iata: "SAN", icao: "KSAN", city: "San Diego", name: "San Diego International Airport", country: "US", lat: 32.7338, lon: -117.1933, demand: 75, type: "large_airport" },
  { iata: "SFO", icao: "KSFO", city: "San Francisco", name: "San Francisco International Airport", country: "US", lat: 37.6213, lon: -122.3790, demand: 92, type: "large_airport" },
  { iata: "SEA", icao: "KSEA", city: "Seattle", name: "Seattle-Tacoma International Airport", country: "US", lat: 47.4502, lon: -122.3088, demand: 88, type: "large_airport" },
  { iata: "DEN", icao: "KDEN", city: "Denver", name: "Denver International Airport", country: "US", lat: 39.8561, lon: -104.6737, demand: 94, type: "large_airport" },
  { iata: "DFW", icao: "KDFW", city: "Dallas-Fort Worth", name: "Dallas Fort Worth International Airport", country: "US", lat: 32.8998, lon: -97.0403, demand: 98, type: "large_airport" },
  { iata: "ORD", icao: "KORD", city: "Chicago", name: "Chicago O'Hare International Airport", country: "US", lat: 41.9742, lon: -87.9073, demand: 100, type: "large_airport" },
  { iata: "JFK", icao: "KJFK", city: "New York", name: "John F. Kennedy International Airport", country: "US", lat: 40.6413, lon: -73.7781, demand: 100, type: "large_airport" },
  { iata: "ATL", icao: "KATL", city: "Atlanta", name: "Hartsfield-Jackson Atlanta International Airport", country: "US", lat: 33.6407, lon: -84.4277, demand: 100, type: "large_airport" },
  { iata: "MIA", icao: "KMIA", city: "Miami", name: "Miami International Airport", country: "US", lat: 25.7959, lon: -80.2870, demand: 92, type: "large_airport" },
];
