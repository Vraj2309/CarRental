import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import carRoutes from './routes/car.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// app.js builds the Express app; server.js starts it.
// Keeping them separate lets tests import the app without opening a port.
const app = express();

app.use(helmet()); // sets secure HTTP headers
app.use(cors({ origin: env.clientUrl })); // only our React app may call the API
app.use(express.json({ limit: '10kb' })); // parse JSON bodies, reject huge ones
if (env.nodeEnv === 'development') app.use(morgan('dev')); // request logs

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
// Phase 3: app.use('/api/bookings', bookingRoutes);

// These two must come last: unmatched routes, then all errors.
app.use(notFound);
app.use(errorHandler);

export default app;
