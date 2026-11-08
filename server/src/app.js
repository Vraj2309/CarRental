import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import carRoutes from './routes/car.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// app.js builds the Express app; server.js starts it.
// Keeping them separate lets tests import the app without opening a port.
const app = express();

// Development-only page for testing the real Razorpay popup (Postman cannot
// show it). It is registered BEFORE helmet on purpose: helmet's security
// policy blocks outside scripts, and this page must load Razorpay's script.
// It never exists in production; the React app will replace it in Phase 6.
if (env.nodeEnv === 'development') {
  const page = fileURLToPath(new URL('../public/payment-test.html', import.meta.url));
  app.get('/payment-test', (_req, res) => res.sendFile(page));
}

app.use(helmet()); // sets secure HTTP headers
app.use(cors({ origin: env.clientUrl })); // only our React app may call the API
app.use(express.json({ limit: '10kb' })); // parse JSON bodies, reject huge ones
if (env.nodeEnv === 'development') app.use(morgan('dev')); // request logs

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);

// These two must come last: unmatched routes, then all errors.
app.use(notFound);
app.use(errorHandler);

export default app;
