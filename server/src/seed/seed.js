require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const CityModel = require("../models/city.model");
const BusModel = require("../models/bus.model");
const UserModel = require("../models/user.model");

// ---- Cities ----
const cities = [
  { name: "Mumbai", state: "Maharashtra" },
  { name: "Delhi", state: "Delhi" },
  { name: "Bengaluru", state: "Karnataka" },
  { name: "Ahmedabad", state: "Gujarat" },
  { name: "Hyderabad", state: "Telangana" },
  { name: "Chennai", state: "Tamil Nadu" },
  { name: "Kolkata", state: "West Bengal" },
  { name: "Pune", state: "Maharashtra" },
  { name: "Jaipur", state: "Rajasthan" },
  { name: "Surat", state: "Gujarat" },
  { name: "Lucknow", state: "Uttar Pradesh" },
  { name: "Kanpur", state: "Uttar Pradesh" },
  { name: "Nagpur", state: "Maharashtra" },
  { name: "Patna", state: "Bihar" },
  { name: "Indore", state: "Madhya Pradesh" },
  { name: "Thane", state: "Maharashtra" },
  { name: "Bhopal", state: "Madhya Pradesh" },
  { name: "Goa", state: "Goa" },
];

// ---- Routes (approximate road distance in km) — buses run both directions ----
const routes = [
  ["Mumbai", "Pune", 150],
  ["Mumbai", "Surat", 280],
  ["Mumbai", "Ahmedabad", 530],
  ["Mumbai", "Nagpur", 840],
  ["Mumbai", "Bengaluru", 980],
  ["Mumbai", "Indore", 585],
  ["Mumbai", "Goa", 590],
  ["Pune", "Bengaluru", 840],
  ["Pune", "Hyderabad", 560],
  ["Pune", "Goa", 450],
  ["Delhi", "Jaipur", 280],
  ["Delhi", "Lucknow", 555],
  ["Delhi", "Kanpur", 490],
  ["Delhi", "Bhopal", 740],
  ["Ahmedabad", "Surat", 270],
  ["Ahmedabad", "Indore", 405],
  ["Ahmedabad", "Jaipur", 660],
  ["Bengaluru", "Chennai", 350],
  ["Bengaluru", "Hyderabad", 570],
  ["Bengaluru", "Goa", 560],
  ["Chennai", "Hyderabad", 630],
  ["Kolkata", "Patna", 585],
  ["Lucknow", "Kanpur", 90],
  ["Lucknow", "Patna", 535],
  ["Nagpur", "Bhopal", 350],
  ["Nagpur", "Hyderabad", 500],
  ["Indore", "Bhopal", 195],
  ["Jaipur", "Lucknow", 575],
  ["Thane", "Pune", 160],
  ["Thane", "Nagpur", 790],
  ["Kanpur", "Patna", 440],
  ["Surat", "Indore", 400],
];

const operators = [
  "Purple Voyager", "Skyline Travels", "Neelkanth Express", "Durga Roadlines",
  "Volvo Comforts", "Highway Kings", "Shreenath Travels", "Zenith Coach",
  "Metro Link Bus", "Evening Star Travels", "Golden Route", "Prime Cruiser",
];

const amenityCombos = [
  ["AC", "SLEEPER"],
  ["AC", "SEATER"],
  ["NONAC", "SLEEPER"],
  ["NONAC", "SEATER"],
  ["AC", "SLEEPER", "WIFI"],
  ["AC", "SEATER", "CHARGING_POINT"],
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function priceForDistance(distanceKm, amenities) {
  const isAC = amenities.includes("AC");
  const isSleeper = amenities.includes("SLEEPER");
  let ratePerKm = isAC ? 2.4 : 1.5;
  if (isSleeper) ratePerKm += 0.4;
  const base = distanceKm * ratePerKm;
  const jitter = randomBetween(-150, 250);
  return Math.max(300, Math.round((base + jitter) / 10) * 10);
}

function buildBusesForRoute(from, to, distanceKm) {
  const busCount = randomBetween(3, 5);
  const buses = [];
  for (let i = 0; i < busCount; i++) {
    const amenities = pick(amenityCombos);
    const departureHour = randomBetween(5, 23);
    const durationHours = Math.max(2, Math.round(distanceKm / 55));
    const arrivalHour = (departureHour + durationHours) % 24;

    buses.push({
      companyname: pick(operators),
      from,
      to,
      price: priceForDistance(distanceKm, amenities),
      email: `bookings@${pick(operators).toLowerCase().replace(/\s+/g, "")}.com`,
      phone: randomBetween(6000000000, 9999999999),
      aminites: amenities,
      rating: Math.round((3.4 + Math.random() * 1.5) * 10) / 10,
      arrival: String(arrivalHour),
      departure: String(departureHour),
      seats: [],
    });
  }
  return buses;
}

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Copy server/.env.example to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB — seeding RaahiGo data...");

  // Re-seeding replaces every bus, which would orphan real bookings in a live database.
  // Refuse in production when data already exists, unless explicitly forced with --force.
  const existing = await BusModel.countDocuments();
  if (existing > 0 && process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error(`Database already has ${existing} buses. Refusing to wipe them in production. Re-run with --force if you really mean it.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await CityModel.deleteMany({});
  await BusModel.deleteMany({});

  await CityModel.insertMany(cities);

  let allBuses = [];
  for (const [from, to, distanceKm] of routes) {
    allBuses = allBuses.concat(buildBusesForRoute(from, to, distanceKm));
    allBuses = allBuses.concat(buildBusesForRoute(to, from, distanceKm));
  }

  await BusModel.insertMany(allBuses);

  // Demo operator account, so the operator dashboard (Phase 10) has real
  // data to show immediately without manually creating an account and
  // buses by hand. Login: demo.operator@raahigo.app / operator123
  await UserModel.deleteOne({ email: "demo.operator@raahigo.app" });
  const hashedPassword = await bcrypt.hash("operator123", 10);
  const demoOperator = await UserModel.create({
    email: "demo.operator@raahigo.app",
    password: hashedPassword,
    gender: "other",
    role: "OPERATOR",
    operatorProfile: { companyName: "Purple Voyager", appliedAt: new Date() },
  });

  const operatorBuses = await BusModel.find({ companyname: "Purple Voyager" }).limit(6);
  await BusModel.updateMany(
    { _id: { $in: operatorBuses.map((b) => b._id) } },
    { $set: { operator: demoOperator._id } }
  );

  // Demo admin account for the admin dashboard (Phase 11).
  // Login: demo.admin@raahigo.app / admin123
  await UserModel.deleteOne({ email: "demo.admin@raahigo.app" });
  const adminPassword = await bcrypt.hash("admin123", 10);
  await UserModel.create({
    email: "demo.admin@raahigo.app",
    password: adminPassword,
    gender: "other",
    role: "ADMIN",
  });

  console.log(`Seed complete:`);
  console.log(`  ${cities.length} cities`);
  console.log(`  ${routes.length * 2} routes (both directions)`);
  console.log(`  1 demo operator account (demo.operator@raahigo.app / operator123)`);
  console.log(`  ${operatorBuses.length} buses assigned to the demo operator`);
  console.log(`  1 demo admin account (demo.admin@raahigo.app / admin123)`);
  console.log(`  ${allBuses.length} buses`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
