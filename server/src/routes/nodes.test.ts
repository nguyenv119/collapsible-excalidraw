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

describe('PATCH /nodes/:id', () => {
  it('updates the specified fields and returns the full node', async () => {
    /**
     * PATCH /nodes/:id with { x, y } updates those columns in the database
     * and returns the complete node object with the new values.
     *
     * Why: This is the persistence mechanism for drag-to-reposition — after
     * the user drops a node, the client PATCHes the new x/y. The response
     * must include the updated values so the client can confirm the save.
     *
     * What breaks: Node positions are not persisted — on reload the node
     * snaps back to its old location.
     */
    // GIVEN a node exists at position (0, 0)
    const { app } = buildTestApp();
    const createRes = await request(app)
      .post('/nodes')
      .send({ title: 'Drag me' });
    const nodeId = createRes.body.id;

    // WHEN patching its position
    const res = await request(app)
      .patch(`/nodes/${nodeId}`)
      .send({ x: 42, y: 99 });

    // THEN the response contains the updated coordinates
    expect(res.status).toBe(200);
    expect(res.body.x).toBe(42);
    expect(res.body.y).toBe(99);
    expect(res.body.title).toBe('Drag me');
  });

  it('returns 404 for a non-existent node', async () => {
    /**
     * PATCH /nodes/:id returns 404 when the node ID does not exist.
     *
     * Why: The client needs to distinguish a successful no-op from a genuine
     * error — silently succeeding on a missing node hides state corruption
     * where the client holds a reference to a deleted node.
     *
     * What breaks: The client believes position updates succeeded for nodes
     * that no longer exist, leading to ghost state in the UI.
     */
    // GIVEN an empty database
    const { app } = buildTestApp();

    // WHEN patching a non-existent node
    const res = await request(app)
      .patch('/nodes/nonexistent')
      .send({ x: 0, y: 0 });

    // THEN the request is rejected
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
