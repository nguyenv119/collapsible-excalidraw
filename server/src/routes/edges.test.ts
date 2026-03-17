import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../server';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    target_id TEXT,
    label TEXT,
    created_at TEXT NOT NULL
  );
`;

function buildTestApp() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return { app: createApp(db), db };
}

/** Seed two nodes so edges have valid endpoints. */
function seedNodes(db: ReturnType<typeof Database>, ids = ['node-1', 'node-2']) {
  const now = new Date().toISOString();
  for (const id of ids) {
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run(id, id, now, now);
  }
}

describe('GET /edges', () => {
  it('returns an empty array when no edges exist', async () => {
    /**
     * GET /edges must return [] (not null/undefined) when the table is empty.
     *
     * Why: Callers map() over the result — a non-array response crashes the
     * client canvas on mount when there are no edges to display.
     *
     * What breaks: Client crashes on initial load with zero edges.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN fetching all edges
    const res = await request(app).get('/edges');

    // THEN the response is an empty array
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all persisted edges with complete fields', async () => {
    /**
     * GET /edges returns every edge row including id, source_id, target_id,
     * label, and created_at.
     *
     * Why: React Flow reconstructs its edge state entirely from this endpoint
     * on every page load — missing or incomplete rows result in invisible
     * connections.
     *
     * What breaks: Edges disappear on reload even though they were persisted.
     */
    // GIVEN a database with two nodes and one edge
    const { app, db } = buildTestApp();
    seedNodes(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('edge-1', 'node-1', 'node-2', 'my-label', now);

    // WHEN fetching all edges
    const res = await request(app).get('/edges');

    // THEN the response contains the edge with all fields
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 'edge-1',
      source_id: 'node-1',
      target_id: 'node-2',
      label: 'my-label',
    });
  });
});

describe('POST /edges', () => {
  it('creates an edge and returns 201 with the new row', async () => {
    /**
     * POST /edges with valid source_id and target_id inserts a new edge and
     * returns it as JSON with HTTP 201.
     *
     * Why: The UI creates edges on drag-connect — the response provides the
     * server-assigned ID the client needs for later deletion.
     *
     * What breaks: Drawn edges have no stable ID and cannot be deleted,
     * causing phantom edges that reappear on reload.
     */
    // GIVEN two existing nodes
    const { app, db } = buildTestApp();
    seedNodes(db, ['src-node', 'tgt-node']);

    // WHEN creating an edge between them
    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'src-node', target_id: 'tgt-node' });

    // THEN a new edge is returned with a server-assigned ID
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source_id: 'src-node',
      target_id: 'tgt-node',
    });
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it('persists an optional label when provided', async () => {
    /**
     * POST /edges with a label field stores it and returns it in the response.
     *
     * Why: Edge labels carry textual meaning (e.g., "calls", "extends") and
     * must round-trip through the API faithfully.
     *
     * What breaks: Labels set by the user are silently dropped, making labeled
     * connections indistinguishable from unlabeled ones.
     */
    // GIVEN two existing nodes
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1', 'n2']);

    // WHEN creating an edge with a label
    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'n1', target_id: 'n2', label: 'calls' });

    // THEN the label is included in the response
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('calls');
  });

  it('rejects with 422 when source_id references a non-existent node', async () => {
    /**
     * POST /edges returns 422 when source_id does not match any node.
     *
     * Why: Dangling edge references cause React Flow to render edges with no
     * visible source handle, silently breaking the graph.
     *
     * What breaks: Invalid edges are inserted and appear as orphaned
     * connections that cannot be cleaned up.
     */
    // GIVEN only one node exists
    const { app, db } = buildTestApp();
    seedNodes(db, ['real-node']);

    // WHEN creating an edge with a non-existent source
    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'nonexistent', target_id: 'real-node' });

    // THEN the request is rejected
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects with 422 when target_id references a non-existent node', async () => {
    /**
     * POST /edges returns 422 when target_id does not match any node.
     *
     * Why: Both endpoints of an edge must refer to real nodes to preserve
     * graph integrity — symmetric to the source_id check.
     *
     * What breaks: Edges pointing to deleted or never-created nodes are
     * persisted and appear as broken arrows after reload.
     */
    // GIVEN only one node exists
    const { app, db } = buildTestApp();
    seedNodes(db, ['real-node']);

    // WHEN creating an edge with a non-existent target
    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'real-node', target_id: 'nonexistent' });

    // THEN the request is rejected
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects with 422 when source_id is missing', async () => {
    /**
     * POST /edges returns 422 when source_id is omitted from the body.
     *
     * Why: source_id is required — accepting a request without it inserts a
     * NULL source into the DB, making the edge unrenderable.
     *
     * What breaks: Malformed payloads corrupt the graph state.
     */
    // GIVEN a node exists
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1']);

    // WHEN creating an edge without source_id
    const res = await request(app)
      .post('/edges')
      .send({ target_id: 'n1' });

    // THEN the request is rejected
    expect(res.status).toBe(422);
  });

  it('rejects with 422 when target_id is missing', async () => {
    /**
     * POST /edges returns 422 when target_id is omitted from the body.
     *
     * Why: Both fields are mandatory for an edge to be meaningful in the graph
     * — symmetric to missing source_id.
     *
     * What breaks: Edges with a NULL target break React Flow rendering.
     */
    // GIVEN a node exists
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1']);

    // WHEN creating an edge without target_id
    const res = await request(app)
      .post('/edges')
      .send({ source_id: 'n1' });

    // THEN the request is rejected
    expect(res.status).toBe(422);
  });
});

describe('DELETE /edges/:id', () => {
  it('removes the edge from the database and returns 204', async () => {
    /**
     * DELETE /edges/:id removes the row and returns HTTP 204 No Content.
     *
     * Why: Edge deletion cleans up connections the user no longer wants — if
     * the row persists, it reappears on the next page reload.
     *
     * What breaks: Deleted edges accumulate and are re-rendered on every
     * canvas load.
     */
    // GIVEN an edge exists between two nodes
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1', 'n2']);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, NULL, ?)`
    ).run('e1', 'n1', 'n2', now);

    // WHEN deleting the edge
    const res = await request(app).delete('/edges/e1');

    // THEN it returns 204 and the row is gone
    expect(res.status).toBe(204);
    const remaining = db.prepare('SELECT * FROM edges WHERE id = ?').get('e1');
    expect(remaining).toBeUndefined();
  });

  it('returns 404 when the edge does not exist', async () => {
    /**
     * DELETE /edges/:id returns 404 for a non-existent edge ID.
     *
     * Why: The client may attempt to delete an edge already removed by a node
     * cascade delete. Without 404, there is no way to distinguish a successful
     * delete from an invalid request.
     *
     * What breaks: Double-delete requests silently succeed, masking bugs in
     * client-side state management.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN deleting a non-existent edge
    const res = await request(app).delete('/edges/nonexistent-id');

    // THEN it returns 404
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('is no longer returned by GET /edges after deletion', async () => {
    /**
     * A deleted edge does not appear in subsequent GET /edges responses.
     *
     * Why: The canvas fetches all edges on load — if a deleted edge still
     * appears, it re-renders, contradicting the user's intent.
     *
     * What breaks: "Ghost" edges reappear every time the page reloads.
     */
    // GIVEN an edge exists
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1', 'n2']);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, label, created_at) VALUES (?, ?, ?, NULL, ?)`
    ).run('e1', 'n1', 'n2', now);

    // WHEN deleting the edge
    await request(app).delete('/edges/e1');

    // THEN GET /edges returns an empty list
    const res = await request(app).get('/edges');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
