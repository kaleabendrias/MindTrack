import { config } from "./config/index.js";
import { connectMongo } from "./infrastructure/database/mongooseConnection.js";
import { createApp } from "./interfaces/http/appFactory.js";

async function bootstrap() {
  await connectMongo();

  const app = createApp();
  app.listen(config.appPort, () => {
    console.log(`Backend listening on port ${config.appPort}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
