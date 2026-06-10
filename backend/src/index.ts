import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import picksRoutes from './routes/picks';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  BACKEND_URL: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: (origin, c) => c.env.BACKEND_URL,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok', name: 'luckylottery-backend' }));

// Mount route modules
app.route('/api/auth', authRoutes);
app.route('/api/picks', picksRoutes);

export default app;