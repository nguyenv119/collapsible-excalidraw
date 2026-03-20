import { Router, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import type Database from 'better-sqlite3';

/**
 * Build the nodes router with the given database instance.
 * Accepts an explicit db parameter to allow in-memory databases in tests.
 */
export function makeNodesRouter(database: Database.Database): Router {
  const router = Router();

  const ALLOWED_NODE_FIELDS = ['title', 'notes', 'x', 'y', 'collapsed', 'parent_id', 'width', 'height',
    'border_color', 'bg_color', 'border_width', 'border_style', 'font_size', 'font_color'] as const;
  type AllowedField = (typeof ALLOWED_NODE_FIELDS)[number];

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

  // POST /nodes/bulk — atomically create multiple nodes with client-supplied IDs
  // IMPORTANT: this route MUST be registered before /:id so the literal string
  // "bulk" is not matched as a node ID by the /:id handler.
  router.post('/bulk', (req: Request, res: Response) => {
    const { nodes } = req.body as { nodes?: Array<Record<string, unknown>> };

    if (!Array.isArray(nodes) || nodes.length === 0) {
      res.status(422).json({ error: 'nodes must be a non-empty array' });
      return;
    }

    // Validate all nodes before inserting any
    for (const node of nodes) {
      if (typeof node['title'] !== 'string' || (node['title'] as string).trim() === '') {
        res.status(422).json({ error: 'each node must have a non-empty title' });
        return;
      }
      if (typeof node['id'] !== 'string' || (node['id'] as string).trim() === '') {
        res.status(422).json({ error: 'each node must have a string id' });
        return;
      }
    }

    const now = new Date().toISOString();

    const bulkInsert = database.transaction((nodeList: Array<Record<string, unknown>>) => {
      for (const node of nodeList) {
        const id = node['id'] as string;
        const title = (node['title'] as string).trim();
        const parent_id = (node['parent_id'] as string | null | undefined) ?? null;
        const notes = (node['notes'] as string | undefined) ?? '';
        const x = (node['x'] as number | undefined) ?? 0;
        const y = (node['y'] as number | undefined) ?? 0;
        const collapsed = (node['collapsed'] as number | undefined) ?? 0;
        const width = (node['width'] as number | null | undefined) ?? null;
        const height = (node['height'] as number | null | undefined) ?? null;
        const border_color = (node['border_color'] as string | null | undefined) ?? null;
        const bg_color = (node['bg_color'] as string | null | undefined) ?? null;
        const border_width = (node['border_width'] as string | null | undefined) ?? null;
        const border_style = (node['border_style'] as string | null | undefined) ?? null;
        const font_size = (node['font_size'] as string | null | undefined) ?? null;
        const font_color = (node['font_color'] as string | null | undefined) ?? null;

        database.prepare(`
          INSERT INTO nodes
            (id, parent_id, title, notes, x, y, collapsed, width, height,
             border_color, bg_color, border_width, border_style, font_size, font_color,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, parent_id, title, notes, x, y, collapsed, width, height,
          border_color, bg_color, border_width, border_style, font_size, font_color,
          now, now,
        );
      }
    });

    bulkInsert(nodes);

    const ids = nodes.map((n) => n['id'] as string);
    const placeholders = ids.map(() => '?').join(', ');
    const created = database.prepare(
      `SELECT * FROM nodes WHERE id IN (${placeholders}) ORDER BY parent_id NULLS FIRST`
    ).all(...ids);
    res.status(201).json(created);
  });

  // PATCH /nodes/bulk — atomically update multiple nodes
  // IMPORTANT: this route MUST be registered before /:id so the literal string
  // "bulk" is not matched as a node ID by the /:id handler.
  router.patch('/bulk', (req: Request, res: Response) => {
    const { patches } = req.body as { patches?: Array<Record<string, unknown>> };

    if (!Array.isArray(patches) || patches.length === 0) {
      res.status(422).json({ error: 'patches must be a non-empty array' });
      return;
    }

    // Validate that every patch references an existing node before mutating anything
    for (const patch of patches) {
      const id = patch['id'];
      if (typeof id !== 'string') {
        res.status(422).json({ error: 'each patch must have a string id' });
        return;
      }
      const existing = database.prepare('SELECT id FROM nodes WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: `Node not found: ${id}` });
        return;
      }
    }

    const now = new Date().toISOString();

    const bulkUpdate = database.transaction((patchList: Array<Record<string, unknown>>) => {
      for (const patch of patchList) {
        const id = patch['id'] as string;
        const updates: Partial<Record<AllowedField, unknown>> = {};
        for (const field of ALLOWED_NODE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(patch, field)) {
            updates[field] = patch[field];
          }
        }
        if (Object.keys(updates).length === 0) continue;

        const setClauses = [...Object.keys(updates).map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
        const values = [...Object.values(updates), now, id];
        database.prepare(`UPDATE nodes SET ${setClauses} WHERE id = ?`).run(...values);
      }
    });

    bulkUpdate(patches);

    // Return all updated nodes
    const ids = patches.map((p) => p['id'] as string);
    const placeholders = ids.map(() => '?').join(', ');
    const updatedNodes = database.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids);
    res.json(updatedNodes);
  });

  // PATCH /nodes/:id — partially update a node
  router.patch('/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = database.prepare('SELECT id FROM nodes WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const updates: Partial<Record<AllowedField, unknown>> = {};
    for (const field of ALLOWED_NODE_FIELDS) {
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
