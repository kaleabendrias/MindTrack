import { config } from "./config/index.js";
import { connectMongo } from "./infrastructure/database/mongooseConnection.js";
import { MongoSystemRepository } from "./infrastructure/repositories/MongoSystemRepository.js";
import { createApp } from "./interfaces/http/appFactory.js";

async function bootstrap() {
  await connectMongo();

  // Verify that MongoDB is running as a replica set BEFORE we start serving
  // traffic. The restore path requires multi-document transactions and
  // refuses to run on standalone instances; failing fast at boot ensures
  // operators see the misconfiguration in their logs rather than only
  // discovering it the first time someone tries to restore a backup.
  await new MongoSystemRepository().assertReplicaSet();

  const app = createApp();
  app.listen(config.appPort, () => {
    console.log(`Backend listening on port ${config.appPort}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
