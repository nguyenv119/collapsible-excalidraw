import { describe, it, expect } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../server';

// Full schema matching production
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

describe('POST /nodes/bulk', () => {
  it('creates all nodes in a single request and returns 201 with the created rows', async () => {
    /**
     * Verifies that POST /nodes/bulk inserts all provided nodes atomically
     * and returns the full rows as 201 JSON.
     *
     * Why: Copy-paste creates a batch of nodes in one operation. If we used
     * N sequential POST /nodes calls, a partial failure (e.g. network drop)
     * would leave an incomplete subgraph on the canvas. The bulk endpoint
     * wraps everything in a SQLite transaction so either all nodes are created
     * or none are.
     *
     * What breaks: A network failure mid-paste leaves orphaned pasted nodes
     * with no parent or siblings, corrupting the canvas layout.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN bulk-creating two nodes with client-supplied IDs
    const nodes = [
      { id: 'uuid-a', title: 'Alpha', x: 10, y: 20 },
      { id: 'uuid-b', title: 'Beta', x: 30, y: 40, parent_id: 'uuid-a' },
    ];
    const res = await request(app).post('/nodes/bulk').send({ nodes });

    // THEN both nodes are returned with 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    const a = res.body.find((n: { id: string }) => n.id === 'uuid-a');
    const b = res.body.find((n: { id: string }) => n.id === 'uuid-b');
    expect(a.title).toBe('Alpha');
    expect(a.x).toBe(10);
    expect(a.y).toBe(20);
    expect(b.parent_id).toBe('uuid-a');
  });

  it('persists the created nodes so they are visible in GET /nodes', async () => {
    /**
     * Verifies that nodes created via POST /nodes/bulk are durably persisted
     * and returned by subsequent GET /nodes requests.
     *
     * Why: If nodes are only returned in the bulk create response but not
     * committed to the DB, they appear on the canvas immediately but vanish
     * on the next page reload — a confusing persistence illusion.
     *
     * What breaks: Pasted nodes are visible after paste but disappear on reload.
     */
    // GIVEN a bulk create of two nodes
    const { app } = buildTestApp();
    const nodes = [
      { id: 'uuid-x', title: 'Xray', x: 0, y: 0 },
      { id: 'uuid-y', title: 'Yankee', x: 100, y: 100 },
    ];
    await request(app).post('/nodes/bulk').send({ nodes });

    // WHEN fetching all nodes
    const res = await request(app).get('/nodes');

    // THEN both are present
    expect(res.status).toBe(200);
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).toContain('uuid-x');
    expect(ids).toContain('uuid-y');
  });

  it('accepts client-supplied IDs and stores them exactly as given', async () => {
    /**
     * Verifies that POST /nodes/bulk uses the client-provided ID rather than
     * generating a new server-side ID.
     *
     * Why: Copy-paste must use predictable IDs that the client assigns so it
     * can wire up parent_id references and edges in the same batch before
     * the server has responded. If the server overwrites IDs, all parent/edge
     * remapping done on the client is invalidated.
     *
     * What breaks: Parent-child relationships and edges between pasted nodes
     * are lost because the IDs don't match what the server actually stored.
     */
    // GIVEN a specific client ID
    const { app } = buildTestApp();
    const clientId = 'client-supplied-uuid-123';

    // WHEN bulk creating with that ID
    const res = await request(app)
      .post('/nodes/bulk')
      .send({ nodes: [{ id: clientId, title: 'Named', x: 0, y: 0 }] });

    // THEN the returned node uses the exact client ID
    expect(res.status).toBe(201);
    expect(res.body[0].id).toBe(clientId);
  });

  it('returns 422 when nodes array is missing', async () => {
    /**
     * Verifies that POST /nodes/bulk rejects requests without a nodes array.
     *
     * Why: A missing array means the request body is malformed. Silently
     * treating it as a no-op would make the client believe the paste
     * succeeded when nothing was actually created.
     *
     * What breaks: Paste appears to succeed but no nodes are created;
     * the user sees no visual feedback and can't tell why nothing appeared.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending a bulk create without the nodes array
    const res = await request(app).post('/nodes/bulk').send({});

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when nodes array is empty', async () => {
    /**
     * Verifies that POST /nodes/bulk rejects an empty nodes array.
     *
     * Why: An empty paste is almost certainly a client bug (copying nothing
     * then pasting). Rejecting it makes the bug visible rather than silently
     * returning an empty 201.
     *
     * What breaks: A regression that sends empty bulk creates goes undetected,
     * making debugging harder when users report that paste does nothing.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending an empty nodes array
    const res = await request(app).post('/nodes/bulk').send({ nodes: [] });

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when any node is missing a title', async () => {
    /**
     * Verifies that POST /nodes/bulk rejects bulk creates where any node
     * lacks a title, which is a required field.
     *
     * Why: The title column is NOT NULL — if we attempt the insert, SQLite
     * will throw, resulting in a 500. We validate early and return 422 with
     * a meaningful error before touching the DB.
     *
     * What breaks: A client bug that omits title causes an unhandled server
     * error, making the paste fail with an opaque 500 instead of a clear
     * validation message.
     */
    // GIVEN a node without a title
    const { app } = buildTestApp();
    const nodes = [{ id: 'uuid-1', x: 0, y: 0 }];

    // WHEN sending the bulk create
    const res = await request(app).post('/nodes/bulk').send({ nodes });

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('is registered before /:id so the string "bulk" is not treated as a node id', async () => {
    /**
     * Verifies that POST /nodes/bulk is matched by the bulk handler and not
     * by the POST /:id handler (which would fail with 404 or a different error).
     *
     * Why: Express route registration order determines which handler fires.
     * If a /:id-style POST route existed before /bulk, the string "bulk"
     * would be matched as an ID, silently routing paste requests to the wrong
     * handler.
     *
     * What breaks: Every paste attempt fails with an unexpected error
     * rather than cleanly creating nodes.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending a structurally invalid request to /nodes/bulk (no nodes key)
    const res = await request(app).post('/nodes/bulk').send({});

    // THEN the bulk handler fires and returns 422 (missing nodes)
    expect(res.status).toBe(422);
    expect(res.body.error).not.toMatch(/not found/i);
  });
});
