# Knowledge Canvas — Developer Reference

## Commands

### Start dev servers (both concurrently)
```bash
npm run dev
```
Starts `tsx watch src/server.ts` (server on :3001) and `vite` (client on :5173) via `concurrently`. Run from repo root.

### Start individual workspaces
```bash
npm run dev --workspace=server   # Express server only, port 3001
npm run dev --workspace=client   # Vite dev server only, port 5173
```

### Build
```bash
npm run build --workspace=server  # tsc → server/dist/
npm run build --workspace=client  # vite build → client/dist/
```

### Install dependencies
```bash
npm install
```
Run from repo root. npm workspaces hoists shared deps to root `node_modules`.

---

## Quality Gates

| Target       | Command                                              | Must pass before commit |
|--------------|------------------------------------------------------|-------------------------|
| Server types | `cd server && npx tsc --noEmit`                      | Yes                     |
| Client types | `cd client && npx tsc --noEmit`                      | Yes                     |

No test runner is configured for MVP (personal local tool). Both typecheck commands must exit 0.

---

## Architecture Map

```
knowledge-canvas/
  package.json                  — npm workspaces ["server","client"], dev script via concurrently
  server/
    package.json                — "type": "commonjs", tsx watch, tsc build
    tsconfig.json               — module: commonjs, target: ES2022, strict
    src/
      db.ts                     — better-sqlite3 init; WAL pragma; CREATE TABLE nodes + edges
      routes/nodes.ts           — GET/POST/PATCH/DELETE /nodes; cascade delete descendants + edges
      server.ts                 — Express app; mounts /nodes router; port 3001
  client/
    package.json                — "type": "module", vite dev/build
    tsconfig.json               — jsx: react-jsx, moduleResolution: bundler, noEmit: true, strict
    vite.config.ts              — @vitejs/plugin-react; proxy /nodes + /edges → localhost:3001
    src/
      main.tsx                  — ReactDOM.createRoot entry point
      App.tsx                   — ReactFlow canvas; all state + event handlers; nodeTypes constant
      api.ts                    — CanvasNodeData + CanvasEdge interfaces; fetch wrappers
      App.css                   — full-height layout; kc-node styles; loading animation
      components/
        CanvasNode.tsx          — NodeProps renderer: title, notes preview, top+bottom Handles
```

### Key files by concern

| Concern                    | File                              |
|----------------------------|-----------------------------------|
| DB schema (source of truth)| `server/src/db.ts`                |
| TypeScript types (client)  | `client/src/api.ts`               |
| All state + event handlers | `client/src/App.tsx`              |
| Node CRUD API              | `server/src/routes/nodes.ts`      |
| Canvas node component      | `client/src/components/CanvasNode.tsx` |

---

## Implementation Plan

### Context

Building a local-only interactive canvas for software engineering notes from scratch. The core motivation: Excalidraw lacks collapsible nodes — the ability to expand a parent node to reveal children (e.g., "Cloud Services" → AWS, GCP, Azure) and collapse to hide them. This spatial organization matches how engineers actually think about systems.

Stack per BRIEF.md: React + TypeScript + @xyflow/react (frontend), Express + TypeScript (backend), SQLite (persistence). Everything on localhost, no auth, no deployment.

Repo state: Green-field. .claude/ tooling exists, git initialized, no code yet, bd not yet initialized.

---

### Architecture

#### Directory structure
```
knowledge-canvas/               ← repo root
  package.json                  ← npm workspaces + concurrently
  server/
    package.json
    tsconfig.json
    src/
      db.ts                     ← better-sqlite3 init, schema, WAL mode
      routes/nodes.ts           ← GET/POST/PATCH/DELETE /nodes
      routes/edges.ts           ← GET/POST/DELETE /edges
      server.ts                 ← Express app on port 3001
  client/
    package.json
    vite.config.ts              ← proxy /nodes and /edges → localhost:3001
    tsconfig.json
    src/
      main.tsx
      App.tsx                   ← ReactFlow + all state + event handlers
      api.ts                    ← typed fetch wrappers
      components/
        Toolbar.tsx
        CanvasNode.tsx          ← title, notes preview, collapse toggle, add child
        FloatingEdge.tsx        ← custom edge with optional label
        NodeDetailPanel.tsx     ← right-side notes editor, debounced save
  CLAUDE.md                     ← update with real commands (KC-1.12)
```

#### Key design decisions

- better-sqlite3 (sync, no friction with CJS bindings) — server uses "type": "commonjs"
- uuidv7 for UUID7 primary keys
- concurrently at root: npm run dev starts both server + client
- Collapse via hidden prop (not removing from state) — keeps edges intact, IDs stable
- Child nodes via React Flow parentId + extent: 'parent' — React Flow native subflow support; child positions are relative to parent
- No tests for MVP — personal local tool, move fast
- No markdown rendering — plain textarea per BRIEF (out of scope)
- Callbacks in node data (onToggleCollapse, onAddChild) — idiomatic React Flow v11 pattern; must be wrapped in useCallback (stable refs) to avoid infinite re-renders

#### Pitfalls for implementers

1. nodeTypes/edgeTypes must be defined outside the component — inline definition causes infinite re-renders
2. extent: 'parent' requires parent node to have explicit style.width/style.minHeight
3. Child node x/y stored in SQLite is relative to parent (React Flow internal coordinate system)
4. Callbacks in data must be useCallback — otherwise they change every render and trigger node re-renders

---

### Beads Breakdown

**Epic: KC-1 — Knowledge Canvas MVP**

| Bead    | Title                                            | Depends on      |
|---------|--------------------------------------------------|-----------------|
| KC-1.1  | Monorepo scaffolding                             | —               |
| KC-1.2  | SQLite schema + Node CRUD API                    | KC-1.1          |
| KC-1.3  | Edge CRUD routes                                 | KC-1.2          |
| KC-1.4  | React app + React Flow canvas (read-only render) | KC-1.1          |
| KC-1.5  | Drag-to-reposition + position persistence        | KC-1.4, KC-1.2  |
| KC-1.6  | Toolbar: add root node                           | KC-1.5          |
| KC-1.7  | Collapse/expand behavior                         | KC-1.6          |
| KC-1.8  | NodeDetailPanel: notes editor                    | KC-1.6          |
| KC-1.9  | Edge creation and deletion (UI)                  | KC-1.3, KC-1.6  |
| KC-1.10 | Child node creation                              | KC-1.7          |
| KC-1.11 | Node deletion (UI)                               | KC-1.9, KC-1.10 |
| KC-1.12 | Update CLAUDE.md with real build commands        | KC-1.2, KC-1.4  |

#### Dependency graph
```
KC-1.1
  ├── KC-1.2 ─── KC-1.3 ──────────────────────┐
  └── KC-1.4                                   │
        └── KC-1.5                             │
              └── KC-1.6                       │
                    ├── KC-1.7 ── KC-1.10 ──┐  │
                    ├── KC-1.8              └─ KC-1.11
                    └──────────── KC-1.9 ───┘
```

---

### Bead Descriptions

#### KC-1.1 — Monorepo scaffolding

Bootstrap the repo so npm run dev starts both server and client concurrently. Nothing else can be built without this.

Files:
- package.json — workspaces: ["server","client"], script: "dev": "concurrently ...", devDep: concurrently
- server/package.json — deps: express, better-sqlite3, uuidv7; devDeps: typescript, @types/*, tsx; script: "dev": "tsx watch src/server.ts"
- server/tsconfig.json — "module": "commonjs", "target": "ES2022", strict, outDir dist
- client/package.json — deps: react, react-dom, @xyflow/react; devDeps: vite, @vitejs/plugin-react, TypeScript types
- client/tsconfig.json — "jsx": "react-jsx", "moduleResolution": "bundler", strict
- client/vite.config.ts — proxy /nodes and /edges to http://localhost:3001
- Placeholder entry points: server/src/server.ts (empty stub), client/src/main.tsx + client/index.html
- Run npm install; verify npm run dev launches without error

#### KC-1.2 — SQLite schema + Node CRUD API

Create the DB schema and the /nodes REST API. This is the data foundation.

Files: server/src/db.ts, server/src/routes/nodes.ts, server/src/server.ts

Schema:
```sql
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY, parent_id TEXT REFERENCES nodes(id),
  title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
  collapsed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY, source_id TEXT, target_id TEXT,
  label TEXT, created_at TEXT NOT NULL
);
```

- db.ts: better-sqlite3 init, WAL pragma, run CREATE TABLE IF NOT EXISTS for both tables
- GET /nodes → SELECT * FROM nodes
- POST /nodes → insert with uuidv7() ID, return new row
- PATCH /nodes/:id → dynamic SET, update updated_at, 404 if not found
- DELETE /nodes/:id → delete node + cascade DELETE FROM edges WHERE source_id=? OR target_id=? in transaction
- Server on port 3001, express.json() middleware

#### KC-1.3 — Edge CRUD routes

Add /edges API. The edges table already exists from KC-1.2.

Files: server/src/routes/edges.ts, server/src/server.ts
- GET /edges → all edges
- POST /edges → validate source_id + target_id exist (422 if not), insert with uuidv7()
- DELETE /edges/:id → 404 if not found

#### KC-1.4 — React app + React Flow canvas (read-only render)

Bootstrap React client with React Flow. Fetch nodes+edges from API and render them. Read-only, no interaction yet — proves the data pipeline end-to-end.

Files: client/index.html, client/src/main.tsx, client/src/App.tsx, client/src/api.ts, client/src/components/CanvasNode.tsx, client/src/App.css

- api.ts: TypeScript interfaces CanvasNodeData + CanvasEdge matching DB schema; fetchNodes(), fetchEdges() stubs for later: createNode, patchNode, deleteNode, createEdge, deleteEdge
- App.tsx: fetch on mount, convert to React Flow Node[] + Edge[], render `<ReactFlow nodeTypes={{ canvasNode: CanvasNode }} fitView />`
- CanvasNode.tsx: NodeProps, render title + 1-line notes preview, Handle top+bottom
- App.css: html, body, #root { height: 100%; margin: 0; } + .react-flow { height: 100vh; }

#### KC-1.5 — Drag-to-reposition + position persistence

On drag end, PATCH the new x/y to the server. Fire-and-forget — React Flow manages local position state.

Files: client/src/api.ts (add patchNode), client/src/App.tsx (add onNodeDragStop)

#### KC-1.6 — Toolbar: add root node

"Add Node" button creates a root node via POST /nodes and appends it to React Flow state.

Files: client/src/components/Toolbar.tsx (new), client/src/api.ts (add createNode), client/src/App.tsx
- Toolbar: fixed top-left, position: absolute; z-index: 10; single "Add Node" button
- Render inside `<ReactFlow>` as overlay child

#### KC-1.7 — Collapse/expand behavior

The core differentiating feature. Toggle button on parent node hides/shows all descendants via React Flow hidden prop. Persists collapsed flag to SQLite.

Files: client/src/components/CanvasNode.tsx, client/src/App.tsx
- Build childMap: Map<string, string[]> on load; pass hasChildren + onToggleCollapse in node data
- onToggleCollapse: toggle collapsed, call patchNode(id, { collapsed }), BFS/DFS to get all descendants, set hidden on each
- On initial load: for each collapsed=1 node, find descendants and set hidden: true in initial Node[]
- Collapse button: ▶ (collapsed) / ▼ (expanded), only shown when hasChildren

#### KC-1.8 — NodeDetailPanel: notes editor

Right-side panel appears when node is selected. Editable title + notes textarea. Debounced PATCH (500ms).

Files: client/src/components/NodeDetailPanel.tsx (new), client/src/App.tsx
- Panel: position: fixed; right: 0; top: 0; height: 100vh; width: 320px
- Props: node | null, onClose, onSave(id, { title?, notes? })
- Debounce in App.tsx via useRef + setTimeout; optimistic local state update

#### KC-1.9 — Edge creation and deletion (UI)

Drag from Handle to create edge → POST; select edge + Delete → DELETE.

Files: client/src/components/FloatingEdge.tsx (new), client/src/api.ts (add createEdge, deleteEdge), client/src/App.tsx
- onConnect → createEdge({ source_id, target_id }) → append to edges state
- onEdgesDelete → deleteEdge(e.id) for each
- FloatingEdge: renders label via `<EdgeLabelRenderer>` when data.label non-null

#### KC-1.10 — Child node creation

"+" button in CanvasNode creates a child via POST /nodes with parent_id. Child uses React Flow parentId + extent: 'parent'.

Files: client/src/components/CanvasNode.tsx, client/src/App.tsx
- Parent node needs style={{ width: 200, minHeight: 140 }} when it has children
- New child: parentId: parentId, extent: 'parent', initial position { x: 50, y: 60 } (relative to parent)
- Update childMap after creation; set hasChildren: true on parent

#### KC-1.11 — Node deletion (UI)

Delete button in NodeDetailPanel (+ keyboard Delete key) removes node and its edges.

Files: client/src/components/NodeDetailPanel.tsx, client/src/api.ts (add deleteNode), client/src/App.tsx
- Server cascade handles edge cleanup; client cleans up local state
- onNodesDelete handler for keyboard Delete; same for panel button

#### KC-1.12 — Update CLAUDE.md with real build commands

Replace the placeholder CLAUDE.md template with project-specific content.

Files: CLAUDE.md
- Commands: npm run dev, npm run build, workspace-specific variants
- Quality gates table: typecheck via npx tsc --noEmit in server + client
- Architecture map of key files

---

### Critical Files

- BRIEF.md — canonical spec for all beads
- AGENTS.md — bd workflow rules, self-contained issue format
- server/src/db.ts — schema source of truth
- client/src/api.ts — TypeScript types shared across all client beads
- client/src/App.tsx — all state + event handler orchestration

---

### Verification (end-to-end)

1. npm run dev → server on :3001, client on :5173
2. Click "Add Node" → node appears, persists on reload
3. Drag node → new position persists on reload
4. Click node → NodeDetailPanel opens; edit notes → auto-saves
5. Add child node → child appears nested in parent
6. Collapse parent → children hidden; reload → still hidden
7. Draw edge between two nodes → edge persists on reload; Delete key removes it
8. Delete node → node, its children, and its edges gone; reload confirms

---

### Filing Commands (after plan approval)
```bash
cd /Users/nguyenv/knowledge-canvas/knowledge-canvas
bd init
bd create "Knowledge Canvas MVP" -t epic -p 1 --json
# then create subtasks with --parent and bd dep add
```
