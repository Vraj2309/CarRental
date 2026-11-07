import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';

// Connect to the database first, then accept requests.
await connectDB();

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
});
