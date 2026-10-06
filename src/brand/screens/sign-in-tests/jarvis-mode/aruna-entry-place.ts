import { useLayoutEffect, useRef, type RefObject } from "react";

/* -----------------------------------------------------------------------------
   Where Aruna's porthole stands on the canvas (owner, 4 Oct 2026: "a good
   button not at the top, somewhere in the canvas … try to place it in a
   better way to have some more attraction"). One rule for every view: the
   porthole belongs to the ask — the shared AssistantDock at the bottom
   centre — as the step up from asking to Aruna.

     beside   12 px right of the dock's right end, level with the resting
              dock (its centre 48 px above the dock's bottom, which does not
              move as the thread grows upward), joined to it by a hairline
     perched  on the dock's top-right corner, 10 px above it, when the stage
              is too narrow for beside (1280 with the Configure panel open);
              it rides the thread's top when the thread opens
     corner   no dock on the stage (nothing run yet): right 24, bottom 28

   Numbers are against the stage's box. The hook writes them as CSS
   variables and `data-place` straight on the porthole (nothing re-renders),
   and the CSS places it with `translate` (never a `transform`).
   -------------------------------------------------------------------------- */

export type EntryPlace = "beside" | "perched" | "corner";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placed {
  place: EntryPlace;
  /** The porthole's top-left, against the stage. */
  x: number;
  y: number;
  /** The hairline to the dock, against the porthole's own box; null in the corner. */
  link: { x: number; y: number; w: number; h: number } | null;
  /** How far above the porthole's top the reveal's bottom sits (beside: clear of the dock's top). */
  tipGap: number;
}

/* The entry's own box, measured rather than assumed.

   It was `ORB = 48`, a constant, from when the entry was a 48 px disc. It is a button with a word on it now (owner,
   4 Oct 2026: "remove this and add a basic text based good button"), so its width is whatever "Ask Aruna" sets — and
   a width the maths does not know is a button half off the stage in the corner, or overlapping the dock beside it.
   The hook measures the element and hands its box in. */
export interface Size {
  width: number;
  height: number;
}
const GAP = 12;
const EDGE = 16;
const PERCH = 10;
const TIP_GAP = 8;

/**
 * The entry's place, from the stage's box, the dock's and its own (all in the page's coordinates). `bar` is an
 * obstacle (Focus's walkthrough bar, `.rl-f2bar`): where the entry would overlap it, it steps up to stand 12 px
 * above the bar's top edge, right-aligned as it was, and drops the hairline to a dock it no longer touches.
 */
export function placeEntry(
  stage: Box,
  dock: Box | null,
  self: Size,
  bar: Box | null = null,
): Placed {
  const p = placeBase(stage, dock, self);
  if (!bar || bar.width <= 0 || bar.height <= 0) return p;
  const w = self.width || 48;
  const h = self.height || 34;
  const l = p.x + stage.left;
  const t = p.y + stage.top;
  const hit =
    l < bar.left + bar.width &&
    l + w > bar.left &&
    t < bar.top + bar.height &&
    t + h > bar.top - GAP;
  if (!hit) return p;
  return { ...p, y: bar.top - GAP - h - stage.top, link: null };
}

function placeBase(stage: Box, dock: Box | null, self: Size): Placed {
  const w = self.width || 48;
  const h = self.height || 34;
  if (!dock || dock.width <= 0 || dock.height <= 0) {
    return {
      place: "corner",
      x: stage.width - 24 - w,
      y: stage.height - 28 - h,
      link: null,
      tipGap: TIP_GAP,
    };
  }
  const dockRight = dock.left + dock.width;
  const dockBottom = dock.top + dock.height;
  const room = stage.left + stage.width - dockRight;
  if (room >= GAP + w + EDGE) {
    const y = dockBottom - 48 - h / 2 - stage.top;
    const top = y + stage.top;
    return {
      place: "beside",
      x: dockRight + GAP - stage.left,
      y,
      link: { x: -GAP, y: h / 2 - 0.5, w: GAP, h: 1 },
      tipGap: top - Math.min(top, dock.top) + TIP_GAP,
    };
  }
  return {
    place: "perched",
    x: dockRight - w - stage.left,
    y: dock.top - PERCH - h - stage.top,
    link: { x: w / 2 - 0.5, y: h, w: 1, h: PERCH },
    tipGap: TIP_GAP,
  };
}

const box = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * Keeps the porthole (`ref`) in its place: on the stage's and the dock's resizes, on a dock that comes or goes
 * (another view, a first run), and once more after each, as a dock that slides in settles.
 */
export function useEntryPlace(
  ref: RefObject<HTMLElement | null>,
  onDocked?: (docked: boolean) => void,
) {
  const told = useRef(onDocked);
  useLayoutEffect(() => {
    told.current = onDocked;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest<HTMLElement>(".sit__stage");
    if (!el || !stage) return;
    let dock: HTMLElement | null = null;
    let bar: HTMLElement | null = null;
    let frame = 0;
    let later = 0;
    const ro = new ResizeObserver(() => soon());
    ro.observe(stage);
    const find = () => {
      const next = stage.querySelector<HTMLElement>(".ad");
      if (next === dock) return;
      if (dock) ro.unobserve(dock);
      dock = next;
      if (dock) ro.observe(dock);
    };
    const measure = () => {
      frame = 0;
      if (!dock || !dock.isConnected) find();
      /* Measured from the element itself, so the word it carries sets the box the maths uses. */
      if (!bar || !bar.isConnected)
        bar = stage.querySelector<HTMLElement>(".rl-f2bar");
      const p = placeEntry(
        box(stage),
        dock ? box(dock) : null,
        box(el),
        bar ? box(bar) : null,
      );
      if (el.dataset.place !== p.place) {
        el.dataset.place = p.place;
        told.current?.(p.place !== "corner");
      }
      el.style.setProperty("--ae-x", `${Math.round(p.x)}px`);
      el.style.setProperty("--ae-y", `${Math.round(p.y)}px`);
      el.style.setProperty("--ae-tip-gap", `${Math.round(p.tipGap)}px`);
      if (p.link) {
        el.style.setProperty("--ae-lx", `${p.link.x}px`);
        el.style.setProperty("--ae-ly", `${p.link.y}px`);
        el.style.setProperty("--ae-lw", `${p.link.w}px`);
        el.style.setProperty("--ae-lh", `${p.link.h}px`);
      } else {
        el.style.setProperty("--ae-lw", "0px");
        el.style.setProperty("--ae-lh", "0px");
      }
    };
    function soon() {
      if (!frame) frame = requestAnimationFrame(measure);
      window.clearTimeout(later);
      later = window.setTimeout(() => {
        if (!frame) frame = requestAnimationFrame(measure);
      }, 340);
    }
    /* A dock that comes or goes: only the stage's children are watched, and only while no dock is held or it left. */
    const mo = new MutationObserver(() => {
      if (!dock || !dock.isConnected || !bar || !bar.isConnected) soon();
    });
    mo.observe(stage, { childList: true, subtree: true });
    window.addEventListener("resize", soon);
    measure();
    /* Placed before the first paint; from the next frame on, a move between places glides. */
    const ready = requestAnimationFrame(() => {
      el.dataset.ready = "";
    });
    return () => {
      cancelAnimationFrame(ready);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", soon);
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, [ref]);
}
