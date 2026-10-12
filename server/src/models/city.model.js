const { Schema, model } = require("mongoose");

const CitySchema = new Schema({
  name: { type: String, required: true },
  state: { type: String, required: true },
});

const CityModel = model("City", CitySchema);

module.exports = CityModel;
