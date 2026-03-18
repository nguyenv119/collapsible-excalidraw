import { useEffect } from 'react';
import type { MutableRefObject } from 'react';         // ← from 'react', NOT '@xyflow/react'
import { useReactFlow } from '@xyflow/react';
import type { Viewport } from '@xyflow/react';

export type ViewportCommand =                          // ← exported for App.tsx import
  | { type: 'fitNode'; nodeId: string }
  | { type: 'restoreViewport'; viewport: Viewport };

interface ViewportControllerProps {
  command: ViewportCommand | null;
  onCommandHandled: () => void;
  getViewportRef: MutableRefObject<(() => Viewport) | null>;
}

const VIEWPORT_KEY = 'kc-viewport';

export function ViewportController({ command, onCommandHandled, getViewportRef }: ViewportControllerProps) {
  const { fitBounds, setViewport, getViewport, getInternalNode } = useReactFlow();

  // Expose getViewport to App so onToggleCollapse can snapshot before dispatching
  useEffect(() => {
    getViewportRef.current = getViewport;
  }, [getViewport, getViewportRef]);

  // Restore saved viewport on mount
  useEffect(() => {
    const saved = localStorage.getItem(VIEWPORT_KEY);
    if (saved) {
      try {
        const vp = JSON.parse(saved) as Viewport;
        setViewport(vp); // immediate, no animation — before first user interaction
      } catch { /* malformed JSON — ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Execute viewport commands
  useEffect(() => {
    if (!command) return;

    if (command.type === 'fitNode') {
      setTimeout(() => {
        // Use getInternalNode to get positionAbsolute — the reliable absolute
        // canvas position for both root and subflow child nodes.
        // (node.position is relative to parent for extent:'parent' nodes)
        const internal = getInternalNode(command.nodeId);
        if (!internal) return;
        const abs = internal.internals.positionAbsolute;
        const x = abs?.x ?? internal.position.x;  // root nodes: position == absolute
        const y = abs?.y ?? internal.position.y;
        const width = (internal.style?.width as number | undefined) ?? 320;
        const height = (internal.style?.height as number | undefined) ?? 240;
        fitBounds({ x, y, width, height }, { padding: 0.15, duration: 400 });
      }, 30); // one frame for layout after children become visible
    }

    if (command.type === 'restoreViewport') {
      setViewport(command.viewport, { duration: 350 });
    }

    onCommandHandled();
  }, [command]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
