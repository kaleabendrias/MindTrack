import mongoose from "mongoose";
import { config } from "../../config/index.js";

export async function connectMongo() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDbName,
    serverSelectionTimeoutMS: 10000
  });
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

export async function startMongoSession() {
  return mongoose.startSession();
}
