import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`PrimeBot backend listening on http://localhost:${config.port}`);
});
