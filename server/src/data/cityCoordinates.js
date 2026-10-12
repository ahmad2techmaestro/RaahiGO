/**
 * Real latitude/longitude for every city this platform serves (matches
 * server/src/seed/seed.js). These are genuine, publicly-verifiable city
 * coordinates — used to simulate bus movement along a real geographic
 * line between real places, rather than inventing fictional geography.
 */
const CITY_COORDINATES = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Surat: { lat: 21.1702, lng: 72.8311 },
  Lucknow: { lat: 26.8467, lng: 80.9462 },
  Kanpur: { lat: 26.4499, lng: 80.3319 },
  Nagpur: { lat: 21.1458, lng: 79.0882 },
  Patna: { lat: 25.5941, lng: 85.1376 },
  Indore: { lat: 22.7196, lng: 75.8577 },
  Thane: { lat: 19.2183, lng: 72.9781 },
  Bhopal: { lat: 23.2599, lng: 77.4126 },
  Goa: { lat: 15.2993, lng: 74.124 },
};

function coordinatesFor(cityName) {
  return CITY_COORDINATES[cityName] || null;
}

module.exports = { CITY_COORDINATES, coordinatesFor };
