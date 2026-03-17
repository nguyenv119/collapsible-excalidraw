import { Router, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import type Database from 'better-sqlite3';

/**
 * Build the nodes router with the given database instance.
 * Accepts an explicit db parameter to allow in-memory databases in tests.
 */
export function makeNodesRouter(database: Database.Database): Router {
  const router = Router();

  // GET /nodes — return all nodes
  router.get('/', (_req: Request, res: Response) => {
    const nodes = database.prepare('SELECT * FROM nodes ORDER BY parent_id NULLS FIRST').all();
    res.json(nodes);
  });

  // POST /nodes — create a new node
  router.post('/', (req: Request, res: Response) => {
    const { title, notes, x, y, parent_id, collapsed } = req.body as {
      title?: string;
      notes?: string;
      x?: number;
      y?: number;
      parent_id?: string | null;
      collapsed?: number;
    };

    if (!title || typeof title !== 'string' || title.trim() === '') {
      res.status(422).json({ error: 'title is required' });
      return;
    }

    const id = uuidv7();
    const now = new Date().toISOString();

    database.prepare(`
      INSERT INTO nodes (id, parent_id, title, notes, x, y, collapsed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parent_id ?? null,
      title.trim(),
      notes ?? '',
      x ?? 0,
      y ?? 0,
      collapsed ?? 0,
      now,
      now,
    );

    const node = database.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    res.status(201).json(node);
  });

  // PATCH /nodes/:id — partially update a node
  router.patch('/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = database.prepare('SELECT id FROM nodes WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const allowed = ['title', 'notes', 'x', 'y', 'collapsed', 'parent_id', 'width', 'height',
      'border_color', 'bg_color', 'border_width', 'border_style', 'font_size'] as const;
    type AllowedField = (typeof allowed)[number];

    const updates: Partial<Record<AllowedField, unknown>> = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = (req.body as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      const node = database.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
      res.json(node);
      return;
    }

    const now = new Date().toISOString();
    const setClauses = [...Object.keys(updates).map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
    const values = [...Object.values(updates), now, id];

    database.prepare(`UPDATE nodes SET ${setClauses} WHERE id = ?`).run(...values);

    const node = database.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    res.json(node);
  });

  /**
   * Collect all descendant node IDs (BFS) starting from the given root IDs.
   * Returns the full set including the roots themselves.
   */
  function collectDescendants(rootIds: string[]): string[] {
    const allIds = new Set<string>(rootIds);
    const queue = [...rootIds];

    const childStmt = database.prepare('SELECT id FROM nodes WHERE parent_id = ?');

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childStmt.all(current) as { id: string }[];
      for (const child of children) {
        if (!allIds.has(child.id)) {
          allIds.add(child.id);
          queue.push(child.id);
        }
      }
    }

    return Array.from(allIds);
  }

  // DELETE /nodes/:id — delete node, all descendants, and related edges
  router.delete('/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = database.prepare('SELECT id FROM nodes WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const allIds = collectDescendants([id]);

    const deleteTransaction = database.transaction((ids: string[]) => {
      // Delete all edges connected to any of the nodes being removed
      const placeholders = ids.map(() => '?').join(', ');
      database.prepare(
        `DELETE FROM edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
      ).run(...ids, ...ids);

      // Delete all nodes (children first due to FK, but SQLite FK enforcement
      // is off by default; deleting in reverse BFS order is safe either way)
      database.prepare(`DELETE FROM nodes WHERE id IN (${placeholders})`).run(...ids);
    });

    deleteTransaction(allIds);

    res.status(204).send();
  });

  return router;
}
