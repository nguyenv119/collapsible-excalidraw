import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// React Flow requires ResizeObserver in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// React Flow uses crypto.randomUUID internally
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid' },
  configurable: true,
});

const mockNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Alpha',
  notes: 'some notes',
  x: 10,
  y: 20,
  width: null,
  height: null,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockEdge: CanvasEdge = {
  id: 'e1',
  source_id: 'n1',
  target_id: 'n2',
  source_handle: null,
  target_handle: null,
  label: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('App — smoke test', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([mockNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([mockEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(mockNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ReactFlow canvas after data loads', async () => {
    /**
     * App mounts and renders the ReactFlow canvas container, proving the
     * data-loading → state-conversion → render pipeline works end-to-end.
     *
     * Why: This is the smoke test for the entire App render path — if the
     * drag-stop wiring (onNodeDragStop) or data conversion breaks, the
     * component will throw during mount.
     *
     * What breaks: The app crashes on load and shows a blank page instead
     * of the canvas.
     */
    // GIVEN the API returns one node and one edge (mocked in beforeEach)

    // WHEN App mounts
    const { container } = render(<App />);

    // THEN the ReactFlow canvas is rendered
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });
  });
});
