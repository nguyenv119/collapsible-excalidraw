import express from 'express';
import type { Database as DatabaseType } from 'better-sqlite3';
import db from './db';
import { makeNodesRouter } from './routes/nodes';
import { makeEdgesRouter } from './routes/edges';

export function createApp(database: DatabaseType) {
  const app = express();
  app.use(express.json());
  app.use('/nodes', makeNodesRouter(database));
  app.use('/edges', makeEdgesRouter(database));
  return app;
}

if (!process.env.VITEST) {
  const app = createApp(db);
  app.listen(3001, () => {
    console.log('Server on :3001');
  });
}
