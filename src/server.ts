import { config } from "./config/env.js";
import { shutdown } from "./neo4j/client.js";
import app from "./app.js";

if (!config.isVercel) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit();
});

export default app;
