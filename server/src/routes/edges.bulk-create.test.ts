import { describe, it, expect } from 'vitest';
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
    width REAL,
    height REAL,
    border_color TEXT,
    bg_color TEXT,
    border_width TEXT,
    border_style TEXT,
    font_size TEXT,
    font_color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    target_id TEXT,
    source_handle TEXT,
    target_handle TEXT,
    label TEXT,
    stroke_color TEXT,
    stroke_width TEXT,
    stroke_style TEXT,
    created_at TEXT NOT NULL
  );
`;

function buildTestApp() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return { app: createApp(db), db };
}

/** Seed nodes for edge creation tests */
function seedNodes(db: ReturnType<typeof Database>, ids: string[]) {
  const now = new Date().toISOString();
  for (const id of ids) {
    db.prepare(
      `INSERT INTO nodes (id, title, x, y, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`
    ).run(id, id, now, now);
  }
}

describe('POST /edges/bulk', () => {
  it('creates all edges in a single request and returns 201 with the created rows', async () => {
    /**
     * Verifies that POST /edges/bulk inserts all provided edges atomically
     * and returns them as 201 JSON.
     *
     * Why: Copy-paste creates multiple edges simultaneously (e.g. all edges
     * between a copied subgraph). Individual POST /edges calls are slower and
     * non-atomic. The bulk endpoint wraps everything in a single transaction.
     *
     * What breaks: A failure mid-paste leaves some edges created and others
     * not, so the pasted subgraph has missing connections.
     */
    // GIVEN two nodes exist (edge endpoints)
    const { app, db } = buildTestApp();
    seedNodes(db, ['node-a', 'node-b', 'node-c']);

    // WHEN bulk-creating two edges with client-supplied IDs
    const edges = [
      { id: 'edge-1', source_id: 'node-a', target_id: 'node-b' },
      { id: 'edge-2', source_id: 'node-b', target_id: 'node-c' },
    ];
    const res = await request(app).post('/edges/bulk').send({ edges });

    // THEN both edges are returned with 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    const e1 = res.body.find((e: { id: string }) => e.id === 'edge-1');
    const e2 = res.body.find((e: { id: string }) => e.id === 'edge-2');
    expect(e1.source_id).toBe('node-a');
    expect(e1.target_id).toBe('node-b');
    expect(e2.source_id).toBe('node-b');
    expect(e2.target_id).toBe('node-c');
  });

  it('persists the created edges so they are visible in GET /edges', async () => {
    /**
     * Verifies that edges created via POST /edges/bulk are durably persisted
     * and returned by subsequent GET /edges requests.
     *
     * Why: If edges are only returned in the bulk create response but not
     * committed to the DB, they vanish on the next page reload.
     *
     * What breaks: Pasted edges revert after reload, so pasted subgraphs
     * lose their connections every time the page refreshes.
     */
    // GIVEN two nodes exist
    const { app, db } = buildTestApp();
    seedNodes(db, ['n1', 'n2']);

    // WHEN bulk-creating an edge
    await request(app)
      .post('/edges/bulk')
      .send({ edges: [{ id: 'e-persist', source_id: 'n1', target_id: 'n2' }] });

    // WHEN fetching all edges
    const res = await request(app).get('/edges');

    // THEN the edge is present
    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id);
    expect(ids).toContain('e-persist');
  });

  it('accepts client-supplied IDs and stores them exactly as given', async () => {
    /**
     * Verifies that POST /edges/bulk uses the client-provided ID rather than
     * generating a new server-side ID.
     *
     * Why: Same as nodes/bulk — the client must control the IDs it assigns
     * so that edge remapping (old→new ID) is consistent with what gets stored.
     *
     * What breaks: Server-generated IDs mean the client's edge state references
     * IDs that don't match the DB, making future edge deletions impossible.
     */
    // GIVEN two nodes exist
    const { app, db } = buildTestApp();
    seedNodes(db, ['n-a', 'n-b']);
    const clientEdgeId = 'my-custom-edge-uuid';

    // WHEN bulk creating with a specific ID
    const res = await request(app)
      .post('/edges/bulk')
      .send({ edges: [{ id: clientEdgeId, source_id: 'n-a', target_id: 'n-b' }] });

    // THEN the returned edge uses the exact client ID
    expect(res.status).toBe(201);
    expect(res.body[0].id).toBe(clientEdgeId);
  });

  it('returns 422 when edges array is missing', async () => {
    /**
     * Verifies that POST /edges/bulk rejects requests without an edges array.
     *
     * Why: A missing array means the request body is malformed. Returning 422
     * makes the client-side bug visible rather than silently doing nothing.
     *
     * What breaks: Paste with edges appears to succeed but no edges are
     * actually created; the user sees disconnected pasted nodes.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending a bulk create without the edges array
    const res = await request(app).post('/edges/bulk').send({});

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when edges array is empty', async () => {
    /**
     * Verifies that POST /edges/bulk rejects an empty edges array.
     *
     * Why: An empty paste is almost certainly a client bug. Rejecting it
     * makes the bug visible.
     *
     * What breaks: Client regressions that send empty edge batches go
     * undetected.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending an empty edges array
    const res = await request(app).post('/edges/bulk').send({ edges: [] });

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when any edge references a non-existent node', async () => {
    /**
     * Verifies that POST /edges/bulk rejects creates where any edge references
     * a node ID that doesn't exist.
     *
     * Why: Dangling edges cause React Flow to render broken connections with
     * no visible source or target handle. Validating before inserting prevents
     * DB corruption.
     *
     * What breaks: Pasted edges with stale node IDs create phantom connections
     * that can't be deleted and look broken on the canvas.
     */
    // GIVEN one real node but edge references a fake node
    const { app, db } = buildTestApp();
    seedNodes(db, ['real-node']);

    // WHEN bulk creating an edge with a missing target
    const res = await request(app)
      .post('/edges/bulk')
      .send({ edges: [{ id: 'e1', source_id: 'real-node', target_id: 'does-not-exist' }] });

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('is registered before /:id so the string "bulk" is not treated as an edge id', async () => {
    /**
     * Verifies that POST /edges/bulk is matched by the bulk handler.
     *
     * Why: Express route order matters — /bulk must come before /:id or the
     * string "bulk" is treated as an edge ID.
     *
     * What breaks: Every paste of edges fails with an unexpected error rather
     * than cleanly creating edges.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending a structurally invalid request to /edges/bulk
    const res = await request(app).post('/edges/bulk').send({});

    // THEN the bulk handler fires and returns 422
    expect(res.status).toBe(422);
    expect(res.body.error).not.toMatch(/not found/i);
  });
});
