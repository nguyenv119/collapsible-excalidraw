import { describe, it, expect } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../server';

// Minimal schema matching production — same as nodes.test.ts
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

// Helper: create a node via the API and return its id
async function createTestNode(app: ReturnType<typeof createApp>, title: string): Promise<string> {
  const res = await request(app).post('/nodes').send({ title });
  return res.body.id as string;
}

describe('PATCH /nodes/bulk', () => {
  it('updates x/y positions for multiple nodes in a single request', async () => {
    /**
     * Verifies that PATCH /nodes/bulk with an array of patches applies each
     * patch to its target node and returns all updated node rows.
     *
     * Why: Multi-drag persistence requires updating all dragged nodes in one
     * round-trip. Using individual PATCH /nodes/:id calls is both slower (N
     * round-trips) and non-atomic (partial failure leaves the canvas in an
     * inconsistent state where some nodes are at new positions and others are
     * not). The bulk endpoint wraps everything in a SQLite transaction.
     *
     * What breaks: If this endpoint is missing or non-atomic, a multi-drag
     * that is interrupted by a server error will leave only some nodes at
     * their new positions on reload — the canvas layout is corrupted.
     */
    // GIVEN two nodes exist at default position (0, 0)
    const { app } = buildTestApp();
    const idA = await createTestNode(app, 'Alpha');
    const idB = await createTestNode(app, 'Beta');

    // WHEN bulk-patching their positions
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({
        patches: [
          { id: idA, x: 100, y: 200 },
          { id: idB, x: 300, y: 400 },
        ],
      });

    // THEN both nodes are updated
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const a = res.body.find((n: { id: string }) => n.id === idA);
    const b = res.body.find((n: { id: string }) => n.id === idB);
    expect(a.x).toBe(100);
    expect(a.y).toBe(200);
    expect(b.x).toBe(300);
    expect(b.y).toBe(400);
  });

  it('returns 422 when patches array is missing', async () => {
    /**
     * Verifies that PATCH /nodes/bulk rejects requests that do not include
     * a patches array, returning a 422 Unprocessable Entity.
     *
     * Why: Without input validation, a malformed request body (e.g. network
     * error that sends a partial body) could be silently treated as a no-op,
     * making the client believe positions were saved when they were not.
     *
     * What breaks: Silent data loss — the user drags multiple nodes, the
     * client believes positions were persisted, but on reload nodes snap back
     * to their old positions.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN bulk-patching without a patches array
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({});

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 when patches array is empty', async () => {
    /**
     * Verifies that PATCH /nodes/bulk rejects an empty patches array.
     *
     * Why: An empty bulk patch is almost certainly a client-side bug (a
     * no-op that should never be sent). Rejecting it surfaces the bug
     * earlier rather than silently returning an empty array.
     *
     * What breaks: A client regression that sends empty bulk patches would
     * go undetected, making debugging harder when nodes fail to move.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN bulk-patching with an empty array
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({ patches: [] });

    // THEN the request is rejected with 422
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when any patch references a non-existent node id', async () => {
    /**
     * Verifies that PATCH /nodes/bulk returns 404 if any patch ID does not
     * exist, and that it does NOT partially update the others (atomicity).
     *
     * Why: Without this check, a multi-drag that references a stale node ID
     * (e.g. a node deleted in another tab) would silently succeed for the
     * valid nodes and skip the missing one. This creates an inconsistency
     * between the client's view of node positions and the database.
     *
     * What breaks: On next reload, nodes that were dragged alongside a
     * deleted node appear at their pre-drag positions, causing a subtle
     * layout regression that is hard to diagnose.
     */
    // GIVEN one real node and one patch referencing a fake ID
    const { app } = buildTestApp();
    const realId = await createTestNode(app, 'Real Node');

    // WHEN one patch targets a nonexistent node
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({
        patches: [
          { id: realId, x: 50, y: 50 },
          { id: 'does-not-exist', x: 99, y: 99 },
        ],
      });

    // THEN the request fails
    expect(res.status).toBe(404);

    // AND the real node is NOT updated (transaction rolled back)
    const getRes = await request(app).get('/nodes');
    const real = getRes.body.find((n: { id: string }) => n.id === realId);
    expect(real.x).toBe(0);
    expect(real.y).toBe(0);
  });

  it('only applies allowed fields and ignores unknown keys', async () => {
    /**
     * Verifies that PATCH /nodes/bulk only updates the allowed node fields
     * and silently ignores any extra keys in each patch object.
     *
     * Why: The allowed-field filter prevents mass-assignment vulnerabilities
     * where an attacker could inject arbitrary SQL column names or override
     * system fields like id or created_at.
     *
     * What breaks: Without the filter, a crafted request could corrupt the
     * node's primary key, timestamps, or other system fields, breaking the
     * entire data integrity model.
     */
    // GIVEN a node at default position
    const { app } = buildTestApp();
    const id = await createTestNode(app, 'Safe Node');
    const originalCreateRes = await request(app).get('/nodes');
    const originalCreatedAt = originalCreateRes.body.find((n: { id: string }) => n.id === id).created_at;

    // WHEN bulk-patching with unknown fields included
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({
        patches: [{ id, x: 77, y: 88, malicious_field: 'injected', created_at: '1970-01-01' }],
      });

    // THEN the request succeeds, applying only allowed fields
    expect(res.status).toBe(200);
    const updated = res.body.find((n: { id: string }) => n.id === id);
    expect(updated.x).toBe(77);
    expect(updated.y).toBe(88);
    // created_at must be unchanged — system field must not be overridable
    expect(updated.created_at).toBe(originalCreatedAt);
  });

  it('is registered before /:id so the string "bulk" is not treated as a node id', async () => {
    /**
     * Verifies that PATCH /nodes/bulk is matched by the bulk handler (which
     * returns 422 for missing patches array) rather than the /:id handler
     * (which returns 404 with error "Node not found" when id="bulk").
     *
     * Why: Express route registration order determines which handler fires.
     * If /:id is registered before /bulk, the string "bulk" is treated as a
     * node ID and every bulk request fails with "Node not found" instead of
     * executing the bulk update logic.
     *
     * What breaks: Every multi-drag attempt returns 404 and no positions are
     * persisted, breaking position persistence for all multi-selections.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN sending a structurally invalid request to /nodes/bulk (no patches key)
    const res = await request(app)
      .patch('/nodes/bulk')
      .send({});

    // THEN the bulk handler fires and returns 422 (missing patches)
    // If /:id handler had fired instead, it would return 404 "Node not found" for id="bulk"
    expect(res.status).toBe(422);
    // The error is about missing patches, not about a missing node
    expect(res.body.error).not.toMatch(/not found/i);
  });
});
