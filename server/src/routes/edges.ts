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
    const { source_id, target_id, source_handle, target_handle, label } = req.body as {
      source_id?: string;
      target_id?: string;
      source_handle?: string | null;
      target_handle?: string | null;
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
      INSERT INTO edges (id, source_id, target_id, source_handle, target_handle, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, source_id, target_id, source_handle ?? null, target_handle ?? null, label ?? null, now);

    const edge = database.prepare('SELECT * FROM edges WHERE id = ?').get(id);
    res.status(201).json(edge);
  });

  // POST /edges/bulk — atomically create multiple edges with client-supplied IDs
  // IMPORTANT: this route MUST be registered before /:id to avoid "bulk" being
  // matched as an edge ID.
  router.post('/bulk', (req: Request, res: Response) => {
    const { edges } = req.body as { edges?: Array<Record<string, unknown>> };

    if (!Array.isArray(edges) || edges.length === 0) {
      res.status(422).json({ error: 'edges must be a non-empty array' });
      return;
    }

    // Validate all edges before inserting any
    for (const edge of edges) {
      if (typeof edge['id'] !== 'string' || (edge['id'] as string).trim() === '') {
        res.status(422).json({ error: 'each edge must have a string id' });
        return;
      }
      if (typeof edge['source_id'] !== 'string') {
        res.status(422).json({ error: 'each edge must have a string source_id' });
        return;
      }
      if (typeof edge['target_id'] !== 'string') {
        res.status(422).json({ error: 'each edge must have a string target_id' });
        return;
      }

      // Verify referenced nodes exist
      const sourceExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(edge['source_id']);
      if (!sourceExists) {
        res.status(422).json({ error: `source node '${edge['source_id']}' does not exist` });
        return;
      }
      const targetExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(edge['target_id']);
      if (!targetExists) {
        res.status(422).json({ error: `target node '${edge['target_id']}' does not exist` });
        return;
      }
    }

    const now = new Date().toISOString();

    const bulkInsert = database.transaction((edgeList: Array<Record<string, unknown>>) => {
      for (const edge of edgeList) {
        const id = edge['id'] as string;
        const source_id = edge['source_id'] as string;
        const target_id = edge['target_id'] as string;
        const source_handle = (edge['source_handle'] as string | null | undefined) ?? null;
        const target_handle = (edge['target_handle'] as string | null | undefined) ?? null;
        const label = (edge['label'] as string | null | undefined) ?? null;
        const stroke_color = (edge['stroke_color'] as string | null | undefined) ?? null;
        const stroke_width = (edge['stroke_width'] as string | null | undefined) ?? null;
        const stroke_style = (edge['stroke_style'] as string | null | undefined) ?? null;

        database.prepare(`
          INSERT INTO edges
            (id, source_id, target_id, source_handle, target_handle, label,
             stroke_color, stroke_width, stroke_style, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, source_id, target_id, source_handle, target_handle, label,
          stroke_color, stroke_width, stroke_style, now,
        );
      }
    });

    bulkInsert(edges);

    const ids = edges.map((e) => e['id'] as string);
    const placeholders = ids.map(() => '?').join(', ');
    const created = database.prepare(
      `SELECT * FROM edges WHERE id IN (${placeholders})`
    ).all(...ids);
    res.status(201).json(created);
  });

  // PATCH /edges/:id — partially update an edge
  router.patch('/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = database.prepare('SELECT id FROM edges WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Edge not found' });
      return;
    }

    const allowed = ['source_id', 'target_id', 'source_handle', 'target_handle', 'label',
      'stroke_color', 'stroke_width', 'stroke_style'] as const;
    type AllowedField = (typeof allowed)[number];

    const updates: Partial<Record<AllowedField, unknown>> = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = (req.body as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      const edge = database.prepare('SELECT * FROM edges WHERE id = ?').get(id);
      res.json(edge);
      return;
    }

    // Validate new source/target nodes exist if being changed
    if (updates.source_id) {
      const sourceExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(updates.source_id);
      if (!sourceExists) {
        res.status(422).json({ error: `source node '${updates.source_id}' does not exist` });
        return;
      }
    }
    if (updates.target_id) {
      const targetExists = database.prepare('SELECT id FROM nodes WHERE id = ?').get(updates.target_id);
      if (!targetExists) {
        res.status(422).json({ error: `target node '${updates.target_id}' does not exist` });
        return;
      }
    }

    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    database.prepare(`UPDATE edges SET ${setClauses} WHERE id = ?`).run(...values);

    const edge = database.prepare('SELECT * FROM edges WHERE id = ?').get(id);
    res.json(edge);
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
