import { useEffect } from 'react';
import type { MutableRefObject } from 'react';         // ← from 'react', NOT '@xyflow/react'
import { useReactFlow } from '@xyflow/react';
import type { Viewport, XYPosition } from '@xyflow/react';

export type ViewportCommand =                          // ← exported for App.tsx import
  | { type: 'fitNode'; nodeId: string }
  | { type: 'restoreViewport'; viewport: Viewport };

interface ViewportControllerProps {
  command: ViewportCommand | null;
  onCommandHandled: () => void;
  getViewportRef: MutableRefObject<(() => Viewport) | null>;
  /** Ref through which App.tsx reads screenToFlowPosition for paste placement. */
  screenToFlowPositionRef: MutableRefObject<((pos: XYPosition) => XYPosition) | null>;
}

export const VIEWPORT_KEY = 'kc-viewport';

export function ViewportController({ command, onCommandHandled, getViewportRef, screenToFlowPositionRef }: ViewportControllerProps) {
  const { fitBounds, setViewport, getViewport, getInternalNode, screenToFlowPosition } = useReactFlow();

  // Expose getViewport to App so onToggleCollapse can snapshot before dispatching
  useEffect(() => {
    getViewportRef.current = getViewport;
  }, [getViewport, getViewportRef]);

  // Expose screenToFlowPosition for paste placement (Cmd+V).
  // Called at paste time (not during render), so keeping the ref current via
  // useEffect is sufficient — no stale-closure issues.
  useEffect(() => {
    screenToFlowPositionRef.current = screenToFlowPosition;
  }, [screenToFlowPosition, screenToFlowPositionRef]);

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
      const cmd = command; // capture before async setTimeout closure
      onCommandHandled();
      setTimeout(() => {
        // Use getInternalNode to get positionAbsolute — the reliable absolute
        // canvas position for both root and subflow child nodes.
        // (node.position is relative to parent for extent:'parent' nodes)
        const internal = getInternalNode(cmd.nodeId);
        if (!internal) return;
        const abs = internal.internals.positionAbsolute;
        const x = abs?.x ?? internal.position.x;  // root nodes: position == absolute
        const y = abs?.y ?? internal.position.y;
        const width = (internal.style?.width as number | undefined) ?? 320;
        const height = (internal.style?.height as number | undefined) ?? 240;
        fitBounds({ x, y, width, height }, { padding: 0.15, duration: 400 });
      }, 30); // one frame for layout after children become visible
      return;
    }

    if (command.type === 'restoreViewport') {
      setViewport(command.viewport, { duration: 350 });
    }

    onCommandHandled();
  }, [command]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
