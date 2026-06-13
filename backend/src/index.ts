import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import picksRoutes from './routes/picks';
import winsRoutes from './routes/wins';
import backtestRoutes from './routes/backtest';
import { scheduledHandler } from './scheduled/checkWins';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = c.env.CORS_ORIGIN;
    if (allowed === '*') return '*';
    return allowed;
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok', name: 'luckylottery-backend' }));

// Mount route modules
app.route('/api/auth', authRoutes);
app.route('/api/picks', picksRoutes);
app.route('/api/wins', winsRoutes);
app.route('/api/backtest', backtestRoutes);

// Manual trigger for win check (for testing)
app.get('/api/admin/check-wins', async (c) => {
  const result = await scheduledHandler(c.env);
  return c.json({ message: 'Win check completed', result });
});

// Scheduled handler for Cron triggers
const scheduled: ExportedHandler<Env>['scheduled'] = async (event, env, ctx) => {
  ctx.waitUntil(scheduledHandler(env));
};

export default { fetch: app.fetch, scheduled };