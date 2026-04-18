import { config } from "./config/env";
import { shutdown } from "./neo4j/client";
import app from "./app";

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
