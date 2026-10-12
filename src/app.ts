import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

import { env } from './config/env';
import { logger } from './config/logger';
import { requestId } from './middleware/requestId';
import { generalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import organizationRoutes from './modules/organizations/organizations.routes';
import userRoutes from './modules/users/users.routes';
import geoRoutes from './modules/geo/geo.routes';
import auditRoutes from './modules/audit/audit.routes';
import householdRoutes from './modules/households/households.routes';
import voterRoutes from './modules/voters/voters.routes';
import taskRoutes from './modules/tasks/tasks.routes';
import reportRoutes from './modules/reports/reports.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId ?? '',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // img-src widened to allow map tiles for the household map UI (/map)
  // below — everything else (script-src, style-src, connect-src, ...) stays
  // at helmet's secure defaults ('self') because the map page's JS/CSS and
  // its API calls are all same-origin; only the tile images are external.
  // Tiles are served from Esri's free ArcGIS Online basemap tile service,
  // not tile.openstreetmap.org directly — see the comment in
  // public/map/app.js's initMap() for why (two other providers were also
  // tried and ruled out there).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'https://server.arcgisonline.com'],
        },
      },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGIN_LIST, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(generalLimiter);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  // Household map UI (docs/modules/08-household-map-ui.md): a small
  // server-rendered-static page, not a separate frontend project — it's a
  // plain client of the JSON API below, authenticating with the same
  // Bearer-token flow. Leaflet is served from node_modules (not a CDN) so the
  // page has no external script dependency and no CSP script-src exception
  // is needed; only map *tile images* are external (OpenStreetMap, allowed
  // above).
  app.use('/map/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
  app.use('/map', express.static(path.join(__dirname, '..', 'public', 'map')));

  // API docs: interactive Swagger UI over the hand-maintained OpenAPI spec at
  // docs/openapi.yaml. This is regenerated/edited by hand after every module —
  // it is the contract the frontend team builds against.
  const openApiPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
  const openApiDocument = YAML.load(openApiPath);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));

  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/organizations', organizationRoutes);
  v1.use('/users', userRoutes);
  v1.use('/', geoRoutes); // /provinces, /districts, /municipalities, /wards, /toles
  v1.use('/audit-logs', auditRoutes);
  v1.use('/households', householdRoutes);
  v1.use('/voters', voterRoutes);
  v1.use('/canvassing-tasks', taskRoutes);
  v1.use('/reports', reportRoutes);

  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
