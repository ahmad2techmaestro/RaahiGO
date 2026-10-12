const mongoose = require("mongoose");

let connect = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in."
    );
  }
  return mongoose.connect(uri, {
    maxPoolSize: 20,                 // enough concurrent queries that one slow request can't queue the rest
    minPoolSize: 2,                  // keep warm connections ready
    serverSelectionTimeoutMS: 8000,  // fail fast with a clear error instead of hanging 30s
    socketTimeoutMS: 30000,
  });
};

module.exports = connect;
