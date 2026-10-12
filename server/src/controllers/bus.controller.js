const express = require("express");
const BusModel = require("../models/bus.model");
const { searchBuses } = require("../services/busSearch.service");

const app = express.Router();

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Premium search: filters, sorting and pagination, plus facets describing
 * what's available on this route so the UI can build its filter sidebar.
 *
 * The older POST /bus/getall is kept as-is for backward compatibility.
 */
app.post("/search", async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.status(400).send({ message: "from and to are required" });
    }

    const result = await searchBuses(req.body);
    return res.send(result);
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
});

// Add a new bus (used by the seed script / future admin tooling)
app.post("/addnew", async (req, res) => {
  try {
    const newBus = await BusModel.create({ ...req.body });
    return res.status(201).send(newBus);
  } catch (error) {
    return res.status(400).send({ message: error.message });
  }
});

// Search buses by route
app.post("/getall", async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.status(400).send({ message: "from and to are required" });
    }

    const source = titleCase(from);
    const destination = titleCase(to);

    const buses = await BusModel.find({ from: source, to: destination });
    return res.send(buses);
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
});

// Get a single bus by id
app.post("/one", async (req, res) => {
  try {
    if (!req.body.id) {
      return res.status(400).send({ message: "id is required" });
    }
    const bus = await BusModel.find({ _id: req.body.id });
    return res.send(bus);
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
});

module.exports = app;
