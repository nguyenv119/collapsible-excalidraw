import { Router, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import type Database from 'better-sqlite3';

/**
 * Build the edges router with the given database instance.
 * Accepts an explicit db parameter to allow in-memory databases in tests.
 */
export function makeEdgesRouter(database: Database.Database): Router {
  const router = Router();

  // GET /edges — return all edges
  router.get('/', (_req: Request, res: Response) => {
    const edges = database.prepare('SELECT * FROM edges').all();
    res.json(edges);
  });

  // POST /edges — create a new edge
  // Returns 422 if source_id or target_id do not reference existing nodes
  router.post('/', (req: Request, res: Response) => {
    const { source_id, target_id, label } = req.body as {
      source_id?: string;
      target_id?: string;
      label?: string | null;
    };

    if (!source_id || typeof source_id !== 'string') {
      res.status(422).json({ error: 'source_id is required' });
      return;
    }

    if (!target_id || typeof target_id !== 'string') {
      res.status(422).json({ error: 'target_id is required' });
      return;
    }

    const sourceExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(source_id);
    if (!sourceExists) {
      res.status(422).json({ error: `source node '${source_id}' does not exist` });
      return;
    }

    const targetExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(target_id);
    if (!targetExists) {
      res.status(422).json({ error: `target node '${target_id}' does not exist` });
      return;
    }

    const id = uuidv7();
    const now = new Date().toISOString();

    database.prepare(`
      INSERT INTO edges (id, source_id, target_id, label, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, source_id, target_id, label ?? null, now);

    const edge = database.prepare('SELECT * FROM edges WHERE id = ?').get(id);
    res.status(201).json(edge);
  });

  // DELETE /edges/:id — delete an edge by ID
  // Returns 404 if the edge does not exist
  router.delete('/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = database.prepare('SELECT id FROM edges WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Edge not found' });
      return;
    }

    database.prepare('DELETE FROM edges WHERE id = ?').run(id);
    res.status(204).send();
  });

  return router;
}
