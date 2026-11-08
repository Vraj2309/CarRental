import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { startBookingJobs } from './jobs/bookingJobs.js';
import app from './app.js';

// Connect to the database first, then start background jobs and accept requests.
await connectDB();
startBookingJobs();

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
  if (env.nodeEnv === 'development') {
    console.log(`Payment test page: http://localhost:${env.port}/payment-test`);
  }
});
