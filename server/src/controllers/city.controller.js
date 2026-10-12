const express = require("express");
const CityModel = require("../models/city.model");

const app = express.Router();

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// List all cities
// The city list almost never changes, so keep it in memory — saves a database round trip (slow on remote Mongo).
let cityCache = { at: 0, data: null };
app.get("/", async (req, res) => {
  try {
    if (!cityCache.data || Date.now() - cityCache.at > 5 * 60 * 1000) {
      cityCache = { at: Date.now(), data: await CityModel.find({}).lean() };
    }
    const data = cityCache.data;
    res.set("Cache-Control", "public, max-age=300"); // the city list barely changes — let browsers reuse it
    res.send(data);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// Autocomplete search for a city (used by the search box)
app.post("/", async (req, res) => {
  try {
    const query = (req.body.destination ?? req.body.source ?? "").toUpperCase().trim();
    if (!query) return res.send([]);

    const cities = await CityModel.find({
      name: { $regex: query, $options: "i" },
    }).limit(10);

    return res.send(cities);
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
});

// Validate that both source and destination are real, distinct cities
app.post("/showcity", async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) {
      return res.status(400).send({ status: "failed", data: "Source and destination are required" });
    }

    const sourceCity = titleCase(source);
    const destinationCity = titleCase(destination);

    const [fromCheck, destinationCheck] = await Promise.all([
      CityModel.findOne({ name: sourceCity }),
      CityModel.findOne({ name: destinationCity }),
    ]);

    if (!fromCheck) {
      return res.send({ status: "failed", data: "Source city is not found" });
    }
    if (!destinationCheck) {
      return res.send({ status: "failed", data: "Destination city is not found" });
    }
    return res.send({ status: "success", data: "Buses on this route are here" });
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
});

module.exports = app;
