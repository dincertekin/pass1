import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { LIST_WIDTH } from "../lib/settings";

// The draggable line between the item list and the item details (desktop only).
//
// Drag it, or focus it with Tab and use the arrow keys (Home/End for the limits). Double-click
// puts it back to the default width. The details pane always keeps at least MIN_DETAIL_WIDTH.

const MIN_DETAIL_WIDTH = 420;
const KEY_STEP = 16;

export function PaneResizer({ width, listLeft, onResize, onResizeEnd }: {
  width: number;
  /** Where the list starts, in page pixels, to turn the pointer position into a width. */
  listLeft: () => number;
  /** Called while dragging, for a live preview. */
  onResize: (width: number) => void;
  /** Called once when the drag or key press is done, to save the width. */
  onResizeEnd: (width: number) => void;
}) {
  const dragging = useRef(false);
  const latest = useRef(width);

  function clamp(value: number) {
    const roomForDetails = window.innerWidth - listLeft() - MIN_DETAIL_WIDTH;
    return Math.round(Math.min(Math.max(value, LIST_WIDTH.min), Math.min(LIST_WIDTH.max, roomForDetails)));
  }

  function set(value: number, done: boolean) {
    latest.current = clamp(value);
    onResize(latest.current);
    if (done) onResizeEnd(latest.current);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Pointer capture keeps the drag going even when the pointer outruns the thin line.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current) set(e.clientX - listLeft(), false);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = "";
    onResizeEnd(latest.current);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next =
      e.key === "ArrowLeft" ? width - KEY_STEP
      : e.key === "ArrowRight" ? width + KEY_STEP
      : e.key === "Home" ? LIST_WIDTH.min
      : e.key === "End" ? LIST_WIDTH.max
      : null;
    if (next === null) return;
    e.preventDefault();
    set(next, true);
  }

  return (
    // A zero-width spot on the list's right border; the hit area spreads 4px either side of it.
    <div className="relative z-10 hidden w-0 md:block">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the item list"
        aria-valuenow={width}
        aria-valuemin={LIST_WIDTH.min}
        aria-valuemax={LIST_WIDTH.max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => set(LIST_WIDTH.default, true)}
        onKeyDown={onKeyDown}
        title="Drag to resize. Double-click to reset."
        className="group absolute inset-y-0 -left-1 w-2 cursor-col-resize touch-none outline-none"
      >
        <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" />
      </div>
    </div>
  );
}
