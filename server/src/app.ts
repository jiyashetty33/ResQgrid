import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { reportsRouter } from './routes/reports.js';
import { incidentsRouter } from './routes/incidents.js';
import { resourcesRouter } from './routes/resources.js';
import { allocationsRouter } from './routes/allocations.js';
import { replanRouter } from './routes/replan.js';
import { dispatchesRouter } from './routes/dispatches.js';
import { dashboardRouter } from './routes/dashboard.js';
import { activityRouter } from './routes/activity.js';
import { analyticsRouter } from './routes/analytics.js';
import { demoRouter } from './routes/demo.js';
import { settingsRouter } from './routes/settings.js';
import { webhooksRouter } from './routes/webhooks.js';
import { automationRouter } from './routes/automation.js';

export function createApp(): express.Application {
  const app = express();

  // Basic security and parsing
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: [ENV.CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (ENV.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // API Routes
  app.use('/api/health', healthRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/incidents', incidentsRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/allocations', allocationsRouter);
  app.use('/api/replan', replanRouter);
  app.use('/api/dispatches', dispatchesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/demo', demoRouter);
  app.use('/api/admin', demoRouter); // Mounts /api/admin/seed
  app.use('/api/settings', settingsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/automation', automationRouter);
  app.use('/api/feed', automationRouter); // Mounts /api/feed/start & /api/feed/stop

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}
