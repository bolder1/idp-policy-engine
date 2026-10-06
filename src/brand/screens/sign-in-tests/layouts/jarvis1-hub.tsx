import {
  animate as animateValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from "motion/react";
import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { EnginePolicy } from "../engine-run";
import type { Tone } from "./jarvis-intents";
import {
  CORE_ARC_R,
  CORE_DOT_LANDED_R,
  CORE_DOT_R,
  CORE_R,
  CX,
  CY,
  HUB_HALF,
  LABEL_X,
  PRES_A,
  PRES_B,
  R,
  SWEEP_IN,
  SWEEP_OUT,
  arcPath,
  polar,
  sectorPath,
  type Segment,
} from "./jarvis1-geometry";
import type { Presence } from "./jarvis1-presence";
import { FLAT, layerShift, projector, useHubTilt } from "./jarvis1-tilt";

/* -----------------------------------------------------------------------------
   ARUNA'S CIRCLE — the ENGINE's circle. For one day (4 Oct 2026) it was the
   sign-in too: the person at its core, the application docked at the gate, the
   conditions orbiting as chips, with the pencil and Replay on the core and no
   run line above. The owner reversed it — "revert the circle, and give me the
   old top bar as we have in Focus" — because the row above the canvas states
   the sign-in for every other view, and this canvas said it twice. So the
   sign-in is the row's again and the circle is only the engine:

     core      the engine's disc, its arcs turning while it works, a dot at
               the heart; her presence lights it
     policies  the outer band's segments in engine order from 12, each with
               one index tick and a leader to its label; hover or focus lights
               one (its label, its leader, a tooltip — the layout's), a press
               locks it as the policy in view
     sweep     the wedge turning to the policy being asked

   3D: the disc's linework is layered SVGs, each at its own translateZ inside
   one rotateX/rotateY parent (perspective 1000, tilt 22° at rest, easing a
   few degrees toward the pointer: jarvis1-tilt.ts). The words over it are on a
   FLAT layer, placed at their anchor's projected point, so text stays
   whole-pixel and never scaled. Reduced motion: flat and still.

   Every mark is the run (5 Oct 2026, owner: "fix the left side circle, give me
   a better one, more accurate"). The clock-face ticks, the dashed orbit, the far
   rings with their drifting ticks and arcs and the full-circle band track are
   gone: they read as measurements and measured nothing. What is left is one
   guide ring, the band under the policies only, one tick and one leader per
   policy, and its state. And the layers share one centre: each is slid down
   by layerShift(z) so the tilt's perspective no longer pushes the far ones
   off it.
   -------------------------------------------------------------------------- */

export type HubPolState =
  "ghost" | "scan" | "found" | "locked" | "passed" | "quiet" | "also";

export interface HubProps {
  policies: readonly EnginePolicy[];
  states: readonly HubPolState[];
  segs: readonly Segment[];
  /** Each policy label's middle (world y): the leaders run to it. */
  labelMid: readonly number[];
  lit: ReadonlySet<string>;
  play: boolean;
  idle: boolean;
  landed: boolean;
  reduced: boolean;
  tone: Tone;
  sweepTo: number | null;
  sweepMs: number;
  bootMs: number;
  breathe: boolean;
  presence: Presence;
  /** The segment lit by hover or focus. */
  hover: number | null;
  /** The policy pressed into view (null: the one that decides). */
  inView: number | null;
  /** The ring has keyboard focus: the hover arc shows on the active segment. */
  onHover: (i: number | null) => void;
  onLock: (i: number) => void;
}

const EASE = [0.2, 0, 0, 1] as const;
const SEG_W = 10;
const H = HUB_HALF;
/* Depths (px toward the viewer): the disc, sunk segments, the core, segments, the sweep, the presence, the lift. */
const Z = {
  disc: 0,
  sunk: 4,
  core: 8,
  segs: 10,
  sweep: 18,
  pres: 20,
  lift: 26,
} as const;
const TAIL_DEG = 42;
const TAIL_N = 14;
const TAIL = Array.from({ length: TAIL_N }, (_, k) => ({
  k,
  o: 0.26 * Math.pow((k + 1) / TAIL_N, 1.7),
}));

/* The disc's own coordinates: centre (0, 0). */
const at0 = (deg: number, r: number) => polar(deg, r, 0, 0);
const arc0 = (a0: number, a1: number, r: number) => arcPath(a0, a1, r, 0, 0);
const sector0 = (a0: number, a1: number, r0: number, r1: number) =>
  sectorPath(a0, a1, r0, r1, 0, 0);

/* The index tick: one per policy at its segment's mid angle, just outside the band, in the segment's colour (it
   sits in the segment's own group). The leader carries on from its outer end. */
const TICK_IN = R + 8;
const TICK_OUT = R + 15;
function Tick({ g }: { g: Segment }) {
  const a = at0(g.mid, TICK_IN);
  const b = at0(g.mid, TICK_OUT);
  return (
    <path
      className="rl-jarvis__ptick"
      d={`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
    />
  );
}

function Layer({
  z,
  flat,
  className = "",
  children,
}: {
  z: number;
  flat: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rl-jarvis__layer${className ? ` ${className}` : ""}`}
      style={
        flat
          ? undefined
          : { transform: `translate3d(0, ${layerShift(z)}px, ${z}px)` }
      }
    >
      <svg
        width={2 * H}
        height={2 * H}
        viewBox={`${-H} ${-H} ${2 * H} ${2 * H}`}
        aria-hidden
      >
        {children}
      </svg>
    </div>
  );
}

/* The sweep: a wedge from the presence to the band, turning to the policy being asked, a comet tail behind its
   edge. Its own component: the angle re-renders only this layer. */
function Sweep({ to, play, ms }: { to: number; play: boolean; ms: number }) {
  const sweep = useMotionValue(play ? 0 : to);
  const [atDeg, setAt] = useState(sweep.get());
  useMotionValueEvent(sweep, "change", (v) => setAt(v));
  useEffect(() => {
    if (!play) {
      sweep.set(to);
      return;
    }
    const c = animateValue(sweep, to, {
      duration: Math.max(0.22, (ms * 0.72) / 1000),
      ease: [0.45, 0, 0.15, 1],
    });
    return () => c.stop();
  }, [to, play, ms, sweep]);
  const a = Math.max(0, atDeg);
  const e0 = at0(a, SWEEP_IN);
  const e1 = at0(a, SWEEP_OUT);
  return (
    <motion.g
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.24 : 0 }}
    >
      {TAIL.map(({ k, o }) => (
        <path
          key={k}
          className="rl-jarvis__sweep"
          fillOpacity={o}
          d={sector0(
            a - TAIL_DEG + (k * TAIL_DEG) / TAIL_N,
            a - TAIL_DEG + ((k + 1) * TAIL_DEG) / TAIL_N + 0.4,
            SWEEP_IN,
            SWEEP_OUT,
          )}
        />
      ))}
      <path
        className="rl-jarvis__sweepedge"
        d={`M ${e0.x} ${e0.y} L ${e1.x} ${e1.y}`}
      />
      <circle className="rl-jarvis__sweephead" cx={e1.x} cy={e1.y} r={3} />
    </motion.g>
  );
}

interface DiscProps {
  policies: readonly EnginePolicy[];
  states: readonly HubPolState[];
  segs: readonly Segment[];
  lit: ReadonlySet<string>;
  play: boolean;
  idle: boolean;
  landed: boolean;
  flat: boolean;
  tone: Tone;
  sweepTo: number | null;
  sweepMs: number;
  bootMs: number;
  breathe: boolean;
  presence: Presence;
  hover: number | null;
  inView: number | null;
  onHover: (i: number | null) => void;
  onLock: (i: number) => void;
}

/* The 3D linework, every layer at its depth (memoised: the pointer's tilt never re-renders it). */
const Disc = memo(function Disc({
  policies,
  states,
  segs,
  lit,
  play,
  idle,
  landed,
  flat,
  tone,
  sweepTo,
  sweepMs,
  bootMs,
  breathe,
  presence,
  hover,
  inView,
  onHover,
  onLock,
}: DiscProps) {
  const gid = useId().replace(/:/g, "");
  const bootS = Math.max(0.3, bootMs / 1000);
  const held = (st: HubPolState) =>
    st === "scan" || st === "found" || st === "locked";
  const sunk = (st: HubPolState) => st === "passed" || st === "quiet";
  const segCls = (i: number) => {
    const st = states[i];
    const p = policies[i];
    return `rl-jarvis__seg is-${st}${landed && st === "locked" ? ` is-${tone}` : ""}${p && lit.has(p.node) ? " is-lit" : ""}`;
  };
  const band = (s: Segment) => arc0(s.a0, s.a1, R);
  const marked = [hover, inView].filter(
    (v, k, a): v is number => v !== null && a.indexOf(v) === k,
  );
  return (
    <>
      {/* The disc: its glow, the guide ring, and the band's track (under the policies only). */}
      <Layer z={Z.disc} flat={flat} className="is-disc">
        <defs>
          <radialGradient id={`${gid}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" className="rl-jarvis__glowstop is-in" />
            <stop offset="100%" className="rl-jarvis__glowstop is-out" />
          </radialGradient>
        </defs>
        <circle
          r={R + 22}
          fill={`url(#${gid}-core)`}
          className={`rl-jarvis__corehalo${breathe ? " is-breathing" : ""}`}
        />
        <motion.circle
          r={R + 22}
          className="rl-jarvis__guide"
          initial={play ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={
            play ? { duration: bootS * 1.2, ease: EASE } : { duration: 0 }
          }
        />
        {segs.length > 0 && (
          <path
            className="rl-jarvis__ptrack"
            d={arc0(segs[0].a0, segs[segs.length - 1].a1, R)}
          />
        )}
        {play && (
          <motion.circle
            className="rl-jarvis__ping"
            initial={{ r: CORE_R, opacity: 0.9 }}
            animate={{ r: R + 26, opacity: 0 }}
            transition={{
              duration: Math.max(0.7, (bootMs * 2.2) / 1000),
              ease: [0.2, 0, 0.4, 1],
            }}
          />
        )}
        {play && landed && (
          <motion.circle
            className="rl-jarvis__landping"
            initial={{ r: PRES_B, opacity: 0.85 }}
            animate={{ r: R + 22, opacity: 0 }}
            transition={{ duration: 1, delay: 0.25, ease: [0.2, 0, 0.4, 1] }}
          />
        )}
      </Layer>

      {/* Sunk: the policies passed over or never reached. */}
      <Layer z={Z.sunk} flat={flat} className="is-sunk">
        {segs.map((g, i) =>
          sunk(states[i]) && policies[i] ? (
            <g key={policies[i].policyId} className={segCls(i)}>
              {/* Never reached: dashed, on its own path (what motion draws loses its dashes). */}
              {states[i] === "quiet" ? (
                <motion.g
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? Math.max(0.3, bootMs / 1000) : 0,
                    delay: play ? 0.16 + i * 0.07 : 0,
                    ease: EASE,
                  }}
                >
                  <path
                    className="rl-jarvis__segarc is-quiet-dash"
                    d={band(g)}
                  />
                </motion.g>
              ) : (
                <motion.path
                  className="rl-jarvis__segarc"
                  d={band(g)}
                  initial={play ? { pathLength: 0, opacity: 0 } : false}
                  animate={
                    play
                      ? { pathLength: 1, opacity: [1, 0.15, 0.85, 0.2, 1] }
                      : { pathLength: 1, opacity: 1 }
                  }
                  transition={
                    play
                      ? {
                          opacity: {
                            duration: 0.34,
                            times: [0, 0.25, 0.5, 0.75, 1],
                          },
                          pathLength: { duration: 0 },
                        }
                      : { duration: 0 }
                  }
                />
              )}
              <Tick g={g} />
            </g>
          ) : null,
        )}
      </Layer>

      {/* The engine core, in depth order after the sunk segments (z 4, then 8): under reduced motion a layer has no
          translateZ, so DOM order is the only depth it has. A disc, its spinner turning while the engine works (a CSS
          spin on a plain group inside the motion.g; `transform-box: view-box` takes the layer's centre, which is
          the disc's), a dot at the heart. It was swallowed by the person's orb on 4 Oct; the orb has gone back to the
          row above the canvas, so this is the centre again — and the presence's colour rules (jarvis.css, "the core
          is the copilot") have been written against it all along. */}
      <Layer z={Z.core} flat={flat} className="is-core">
        <motion.g
          initial={play ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: play ? 0.4 : 0, delay: play ? 0.1 : 0 }}
        >
          {/* Core states (5 Oct): idle, the disc breathes (CSS, 4 s, opacity and a hair of scale); speaking, a soft
              pulse leaves its ring (1.2 s, no amplitude); landing, one flash of the verdict's tone. None of it under
              reduced motion — only the verdict glows strongly. */}
          <circle
            r={CORE_R}
            className={`rl-jarvis__coredisc${flat ? "" : " is-alive"}`}
          />
          {!flat && <circle r={CORE_R} className="rl-jarvis__corepulse" />}
          {!flat && play && landed && (
            <motion.circle
              key="coreflash"
              className="rl-jarvis__coreflash"
              r={CORE_R}
              initial={{ opacity: 0.9, r: CORE_R }}
              animate={{ opacity: 0, r: CORE_R + 9 }}
              transition={{ duration: 0.6, ease: EASE }}
            />
          )}
          {idle && (
            <g className="rl-jarvis__corespin">
              <path
                className="rl-jarvis__corearc"
                d={arc0(0, 110, CORE_ARC_R)}
              />
              <path
                className="rl-jarvis__corearc is-b"
                d={arc0(180, 250, CORE_ARC_R)}
              />
            </g>
          )}
          <circle
            r={landed ? CORE_DOT_LANDED_R : CORE_DOT_R}
            className="rl-jarvis__coredot"
          />
        </motion.g>
      </Layer>

      {/* The band: the policies still to ask, and one that also covers (lemon, dashed); every segment's hit. */}
      <Layer z={Z.segs} flat={flat} className="is-segs">
        {segs.map((g, i) => {
          const st = states[i];
          const p = policies[i];
          if (!p) return null;
          return (
            <g key={p.policyId} className={segCls(i)}>
              {st === "ghost" && (
                <motion.path
                  className="rl-jarvis__segarc"
                  d={band(g)}
                  initial={play ? { pathLength: 0, opacity: 0 } : false}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    play
                      ? {
                          duration: Math.max(0.3, bootMs / 1000),
                          delay: 0.16 + i * 0.07,
                          ease: EASE,
                        }
                      : { duration: 0 }
                  }
                />
              )}
              {(st === "ghost" || st === "also") && <Tick g={g} />}
              {/* Also covers, not used: lemon, and dashed too (its own path: what motion draws keeps its own dashes). */}
              {st === "also" && (
                <motion.g
                  initial={play ? { opacity: 0 } : false}
                  animate={play ? { opacity: [0, 1, 0.4, 1] } : { opacity: 1 }}
                  transition={{ duration: play ? 0.9 : 0 }}
                >
                  <path className="rl-jarvis__segarc is-dashed" d={band(g)} />
                  <path
                    className="rl-jarvis__segbracket"
                    d={arc0(g.a0 - 1, g.a1 + 1, R + 13)}
                  />
                </motion.g>
              )}
              <path
                className="rl-jarvis__seghit"
                data-card
                d={arc0(g.a0, g.a1, R)}
                onPointerEnter={() => onHover(i)}
                onPointerLeave={() => onHover(null)}
                onClick={() => onLock(i)}
              />
            </g>
          );
        })}
      </Layer>

      {sweepTo !== null && (
        <Layer z={Z.sweep} flat={flat} className="is-sweep">
          <Sweep to={sweepTo} play={play} ms={sweepMs} />
        </Layer>
      )}

      {/* Aruna's presence: two rings round the core — the state's motion over them, the core itself its colour. */}
      <Layer z={Z.pres} flat={flat} className="is-pres">
        <g className="rl-jarvis__presrings">
          <circle r={PRES_A} />
          <circle r={PRES_B} className="is-b" />
        </g>
        <g className="jv1-pr" data-state={presence}>
          {[0, 1, 2].map((k) => (
            <circle
              key={`w${k}`}
              className="jv1-pr__wave"
              r={CORE_R + 2}
              style={{ "--k": k } as CSSProperties}
            />
          ))}
          {[0, 1].map((k) => (
            <circle
              key={`e${k}`}
              className="jv1-pr__ear"
              r={PRES_B - 2}
              style={{ "--k": k } as CSSProperties}
            />
          ))}
          <circle
            className="jv1-pr__think"
            r={(CORE_R + PRES_A) / 2}
            pathLength={100}
          />
        </g>
      </Layer>

      {/* The lift: the policy at work and the one that decides, raised off the ring; the reticle; the one hovered or in view. */}
      <Layer z={Z.lift} flat={flat} className="is-lift">
        {segs.map((g, i) => {
          const st = states[i];
          const p = policies[i];
          if (!p || !held(st)) return null;
          const glowAt = at0(g.mid, R);
          return (
            <g key={p.policyId} className={`${segCls(i)} is-held`}>
              <radialGradient id={`${gid}-lock-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" className="rl-jarvis__lockstop is-in" />
                <stop offset="100%" className="rl-jarvis__lockstop is-out" />
              </radialGradient>
              <circle
                className="rl-jarvis__lockglow"
                cx={glowAt.x}
                cy={glowAt.y}
                r={36}
                fill={`url(#${gid}-lock-${i})`}
              />
              <motion.path
                className="rl-jarvis__segarc"
                d={band(g)}
                initial={play ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={
                  play
                    ? { duration: Math.max(0.3, bootMs / 1000), ease: EASE }
                    : { duration: 0 }
                }
              />
              {play && (
                <motion.path
                  className="rl-jarvis__segpulse"
                  d={band(g)}
                  initial={{ strokeWidth: SEG_W, opacity: 0.7 }}
                  animate={{ strokeWidth: SEG_W + 26, opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.2, 0, 0.3, 1] }}
                />
              )}
              <Tick g={g} />
              {/* The reticle: brackets at both ends, outside and inside the band. */}
              {[
                [g.a0 - 4, g.a0 + 2],
                [g.a1 - 2, g.a1 + 4],
              ].map(([a, b]) => (
                <g key={a} className="rl-jarvis__reticlearc">
                  <motion.path
                    d={arc0(a, b, R + 16)}
                    initial={play ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: play ? 0.34 : 0, ease: EASE }}
                  />
                  <motion.path
                    d={arc0(a, b, R - 16)}
                    initial={play ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: play ? 0.34 : 0, ease: EASE }}
                  />
                </g>
              ))}
              {/* The decider's hit lives here too: it stands above the band. */}
              <path
                className="rl-jarvis__seghit"
                data-card
                d={arc0(g.a0, g.a1, R)}
                onPointerEnter={() => onHover(i)}
                onPointerLeave={() => onHover(null)}
                onClick={() => onLock(i)}
              />
            </g>
          );
        })}
        {marked.map((i) => {
          const g = segs[i];
          if (!g) return null;
          return (
            <path
              key={`mark-${i}`}
              className={`rl-jarvis__segmark${i === inView ? " is-inview" : ""}`}
              d={arc0(g.a0 - 1, g.a1 + 1, R + 19)}
            />
          );
        })}
      </Layer>
    </>
  );
});

export function JarvisHub(p: HubProps) {
  const hubRef = useRef<HTMLDivElement | null>(null);
  const flat = p.reduced;
  const { tilt, yaw } = useHubTilt(hubRef, !flat);
  const P = flat ? FLAT : projector(tilt, yaw);
  const at = (x: number, y: number, z: number) => {
    const q = P(x, y, z);
    return { x: CX + q.x, y: CY + q.y };
  };

  // --- The leaders: from each segment's projected outer edge to its label ---
  const leaders = p.segs.map((g, i) => {
    const st = p.states[i];
    const z =
      st === "scan" || st === "found" || st === "locked"
        ? Z.lift
        : st === "passed" || st === "quiet"
          ? Z.sunk
          : Z.segs;
    /* From the tick's outer end: ring, tick, leader and label are one line. */
    const e = at0(g.mid, TICK_OUT);
    const s = at(e.x, e.y + (flat ? 0 : layerShift(z)), z);
    const y = Math.round(p.labelMid[i] ?? s.y);
    return {
      i,
      d: `M ${s.x} ${s.y} L ${LABEL_X - 14} ${y} L ${LABEL_X - 3} ${y}`,
    };
  });

  return (
    <>
      {/* The 3D disc: perspective about the circle's centre; the pointer leans it a few degrees. */}
      <div
        ref={hubRef}
        className={`rl-jarvis__hub3d${flat ? " is-flat" : ""}`}
        style={{ left: CX - H, top: CY - H, width: 2 * H, height: 2 * H }}
        aria-hidden
      >
        <div
          className="rl-jarvis__disc"
          style={
            flat
              ? undefined
              : { transform: `rotateX(${tilt}deg) rotateY(${yaw}deg)` }
          }
        >
          <Disc
            policies={p.policies}
            states={p.states}
            segs={p.segs}
            lit={p.lit}
            play={p.play}
            idle={p.idle}
            landed={p.landed}
            flat={flat}
            tone={p.tone}
            sweepTo={p.sweepTo}
            sweepMs={p.sweepMs}
            bootMs={p.bootMs}
            breathe={p.breathe}
            presence={p.presence}
            hover={p.hover}
            inView={p.inView}
            onHover={p.onHover}
            onLock={p.onLock}
          />
        </div>
      </div>

      {/* The flat layer: the policies' leaders, each from its segment's projected edge to its label. */}
      <svg
        className="rl-jarvis__leaders"
        width={LABEL_X}
        height={CY + H}
        aria-hidden
      >
        {leaders.map(({ i, d }) => {
          const st = p.states[i];
          const pol = p.policies[i];
          if (!pol) return null;
          const on = p.hover === i || p.inView === i;
          return (
            <g
              key={pol.policyId}
              className={`rl-jarvis__seg is-${st}${p.landed && st === "locked" ? ` is-${p.tone}` : ""}${p.lit.has(pol.node) || on ? " is-lit" : ""}`}
            >
              <path className="rl-jarvis__leader" d={d} />
            </g>
          );
        })}
      </svg>
    </>
  );
}
