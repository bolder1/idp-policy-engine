import {
  animate as animateValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Clock,
  CornerDownLeft,
  Gauge,
  Laptop,
  Lock,
  Mic,
  Plus,
  Volume2,
  VolumeX,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";

import { DECISION_WORDS } from "../../../decision-words";
import { Tip } from "../../../kit";
import { AppLogo } from "../../../logos/AppLogo";
import { useBrand } from "../../../store";
import type { LineStatus } from "../../testing/evidence";
import type { FormField } from "../../testing/sign-in-form";
import {
  sentenceTokens,
  tokenValue,
  type SentenceContext,
  type TokenId,
} from "../../testing/sign-in-sentence";
import { WhatTheySee } from "../../testing/WhatTheySee";
import {
  checkPhase,
  policyFound,
  policyOpen,
  policyPhase,
  type CheckRow,
  type EnginePolicy,
  type EngineRule,
  type EngineRun,
} from "../engine-run";
import {
  eachGroupRows,
  expectMark,
  factMarks,
  heroFinding,
  traceResult,
  type FactKey,
} from "../journey";
import { groupNamesOf } from "../sign-in-card";
import { stepMs } from "../use-engine-run";
import { Decode, Typed } from "./jarvis-decode";
import {
  CHECK_H,
  CORE_R,
  CX,
  CY,
  FACE_R,
  HEAD_H,
  ID_H,
  LABEL_W,
  LABEL_X,
  PANEL_HEAD,
  PANEL_PAD,
  PANEL_W,
  PANEL_X,
  QUIET_H,
  R,
  RING_A,
  RING_B,
  RING_BOTTOM,
  ROW_GAP,
  STRIP_H,
  STRIP_TOP,
  SUB_H,
  SWEEP_IN,
  SWEEP_OUT,
  THEN_H,
  TOP,
  VERDICT_W,
  VERDICT_X,
  WORLD_W,
  arcPath,
  panelHeightMax,
  polar,
  rowHeight,
  rowLook,
  sectorPath,
  segmentsOf,
  stack,
  verdictHeight,
  type Segment,
} from "./jarvis-geometry";
import {
  answerOf,
  chipsOf,
  decisionTone,
  deciderVia,
  denyMessageOf,
  factOf,
  factorsOf,
  failingOf,
  landingOf,
  lineAll,
  lineLanding,
  lineLock,
  lineRules,
  lineRulesShort,
  lineStart,
  lineVerdict,
  matchIntent,
  needOf,
  toneOf,
  type Answer,
  type AskContext,
  type Chip,
  type Intent,
  type Tone,
} from "./jarvis-intents";
import {
  canListen,
  createVoice,
  listenOnce,
  readVoiceOn,
  writeVoiceOn,
  type Voice,
} from "./jarvis-voice";
import { RunStage, type StageView } from "./RunStage";
import {
  JARVIS_DISSOLVE_MS,
  JARVIS_EXIT_EVENT,
  jarvisEntering,
} from "../jarvis-mode/jarvis-timing";
import { JarvisFar } from "./jarvis-depth";
import { useParallax } from "./jarvis-parallax";
import type { RunLayoutProps } from "./types";
import "./jarvis.css";

/* -----------------------------------------------------------------------------
   The run as JARVIS (run-layout.ts `jarvis`): the access assistant's HUD.

   A dimmed stage of fine holographic linework. The person is the core, like
   an arc reactor; the sign-in's facts orbit its left half; the application's
   policies are arc segments of its right half, in reading order from 12
   o'clock. A radar sweep turns to each policy as the engine asks it — one
   that does not cover the person flickers and dims, the first that does is
   locked by a reticle. It expands into the analysis panel: its rules in
   order, each scanned, its checks resolving one by one; a miss glitches and
   settles red, the first match locks. The verdict assembles at the right.

   It speaks the run's key beats (Web Speech, once a run, subtitled at the
   bottom), and it answers: suggestions for THIS run, a command bar to type
   or say what to ask, and every policy, fact and rule is a button that shows
   its detail. Every answer is composed from the plan (jarvis-intents.ts).

   Colour is meaning, even on the dark stage: the HUD's blue only on what the
   engine works on now (the sweep, the reticle closing, the row being read);
   green covers / matches / ✓ / an allow; red ✕ / a deny; amber only a
   conflict or can't tell; grey not reached. Once landed the blue is gone and
   the route takes the answer's one tone. Brand orange never.

   Everything is drawn from `s` (engine-run.ts, journey.ts); durations from
   `stepMs`. Motion animates only transform-free properties or elements with
   no CSS transform or transition of their own. Geometry is fixed by the plan
   (jarvis-geometry.ts), so nothing is measured off transformed boxes.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const;
/* The sign-ins this page has already shown here: a remount on one of them (a
   revisit, the canvas switched back) says nothing again. */
const SEEN = new Set<string>();
/** About how long a line takes to say, at the voice's rate. */
const estMs = (line: string) => line.length * 64 + 250;
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/* The sign-in's facts, as the HUD orbits them: which form field states each,
   and which check categories read it. */
const TOKEN_FIELD: Partial<Record<TokenId, FormField>> = {
  from: "address",
  device: "device",
  when: "when",
  risk: "risk",
};
const TOKEN_WORD: Partial<Record<TokenId, string>> = {
  from: "Network",
  device: "Device",
  when: "Time",
  risk: "Risk",
};
const TOKEN_CATS: Partial<Record<TokenId, readonly CheckRow["category"][]>> = {
  from: ["network", "place"],
  device: ["device"],
  when: ["time"],
  risk: ["risk"],
};
const TOKEN_KEYS: Partial<Record<TokenId, readonly FactKey[]>> = {
  from: ["network", "place"],
  device: ["device"],
  when: ["time"],
  risk: ["risk"],
};
const TOKEN_ICON: Partial<Record<TokenId, LucideIcon>> = {
  from: Wifi,
  device: Laptop,
  when: Clock,
  risk: Gauge,
};

interface Fact {
  token: TokenId;
  field: FormField;
  label: string;
  value: string;
  unset: boolean;
}

type PolState =
  "ghost" | "scan" | "found" | "locked" | "passed" | "quiet" | "also";

function polState(
  p: EnginePolicy,
  s: number,
  landed: boolean,
  also: ReadonlySet<string>,
): PolState {
  if (policyFound(p, s)) return "found";
  const ph = policyPhase(p, s);
  if (ph === "waiting") return "ghost";
  if (ph === "working") return "scan";
  if (p.decides) return "locked";
  if (landed && also.has(p.policyId)) return "also";
  return p.scanned ? "passed" : "quiet";
}

/* "Ravi Menon is not in it" in a few words. */
function reasonWords(reason: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return "Not in it";
  return reason;
}

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: "Passed" },
  fail: { Icon: X, label: "Failed" },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
};

/* The ✓ and ✕ as strokes, so they can DRAW as they land (a run playing); can't tell keeps its icon. */
const STROKES: Partial<Record<LineStatus, readonly string[]>> = {
  pass: ["M 3.2 8.4 L 6.6 11.6 L 12.8 4.6"],
  fail: ["M 4.2 4.2 L 11.8 11.8", "M 11.8 4.2 L 4.2 11.8"],
};

function Mark({
  status,
  label,
  size = 13,
  draw = false,
}: {
  status: LineStatus;
  label?: string;
  size?: number;
  draw?: boolean;
}) {
  const { Icon, label: said } = MARK[status];
  const strokes = STROKES[status];
  return (
    <span
      className={`rl-jarvis__mark is-${status}`}
      role="img"
      aria-label={label ?? said}
    >
      {strokes ? (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
          {strokes.map((d, i) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={draw ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={
                draw
                  ? { duration: 0.26, delay: i * 0.1, ease: [0.3, 0, 0.2, 1] }
                  : { duration: 0 }
              }
            />
          ))}
        </svg>
      ) : (
        <Icon size={size} strokeWidth={2.6} aria-hidden />
      )}
    </span>
  );
}

/** The HUD's spinner: an arc turning (a CSS spin on an element motion never touches). */
function Busy({ label = "Working" }: { label?: string }) {
  return (
    <span className="rl-jarvis__busy" role="img" aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.6"
        />
        <path
          d="M 7 1.5 A 5.5 5.5 0 0 1 12.5 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/* The target lock: four corner brackets closing in on what they frame. Its
   colour is its parent's (currentColor), so the corners themselves carry no
   transition — motion moves them. */
function Reticle({ play, gap = 6 }: { play: boolean; gap?: number }) {
  const corners: {
    k: string;
    style: CSSProperties;
    from: { x: number; y: number };
  }[] = [
    { k: "tl", style: { left: -gap, top: -gap }, from: { x: -12, y: -12 } },
    { k: "tr", style: { right: -gap, top: -gap }, from: { x: 12, y: -12 } },
    { k: "bl", style: { left: -gap, bottom: -gap }, from: { x: -12, y: 12 } },
    { k: "br", style: { right: -gap, bottom: -gap }, from: { x: 12, y: 12 } },
  ];
  return (
    <span className="rl-jarvis__reticle" aria-hidden>
      {corners.map((c) => (
        <motion.span
          key={c.k}
          className={`rl-jarvis__corner is-${c.k}`}
          style={c.style}
          initial={play ? { ...c.from, opacity: 0 } : false}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={play ? { duration: 0.34, ease: EASE } : { duration: 0 }}
        />
      ))}
    </span>
  );
}

// --- The ring ------------------------------------------------------------------------------

interface RingProps {
  plan: EngineRun;
  play: boolean;
  idle: boolean;
  landed: boolean;
  tone: Tone;
  states: PolState[];
  segs: Segment[];
  labelMid: number[];
  lit: ReadonlySet<string>;
  spin: MotionValue<number>;
  sweepTo: number | null;
  sweepMs: number;
  bootMs: number;
  /** Settled and motion allowed: the core breathes. */
  breathe: boolean;
}

const SEG_W = 9;
/* The sweep's comet tail: thin slices behind its edge, fading out — a smooth tail without a gradient fill. */
const TAIL_DEG = 42;
const TAIL_N = 14;
const TAIL = Array.from({ length: TAIL_N }, (_, k) => ({
  k,
  o: 0.26 * Math.pow((k + 1) / TAIL_N, 1.7),
}));
/* The major ticks round the ring: every 30°, drawn in turn as the HUD boots. */
const MAJORS = Array.from({ length: 12 }, (_, i) => i * 30);

/* The ring, its sweep and its core: one SVG, every path drawn from the
   spin (a drag turns the ring a little, and it springs back), the sweep's
   angle from a motion value — no transform on anything motion moves. */
function Ring({
  plan,
  play,
  idle,
  landed,
  tone,
  states,
  segs,
  labelMid,
  lit,
  spin,
  sweepTo,
  sweepMs,
  bootMs,
  breathe,
}: RingProps) {
  const gid = useId().replace(/:/g, "");
  const [turn, setTurn] = useState(0);
  useMotionValueEvent(spin, "change", (v) => setTurn(v));
  const sweep = useMotionValue(sweepTo ?? segs[0]?.a0 ?? 0);
  const [sweepAt, setSweepAt] = useState(sweep.get());
  useMotionValueEvent(sweep, "change", (v) => setSweepAt(v));
  useEffect(() => {
    if (sweepTo === null) return;
    if (!play) {
      sweep.set(sweepTo);
      return;
    }
    const c = animateValue(sweep, sweepTo, {
      duration: Math.max(0.22, (sweepMs * 0.72) / 1000),
      ease: [0.45, 0, 0.15, 1],
    });
    return () => c.stop();
  }, [sweepTo, play, sweepMs, sweep]);

  const sweeping = sweepTo !== null;
  const bootS = Math.max(0.3, bootMs / 1000);
  const boot = (i: number) => ({
    initial: play ? { pathLength: 0, opacity: 0 } : false,
    animate: { pathLength: 1, opacity: 1 },
    transition: play
      ? { duration: bootS * 1.2, delay: i * 0.06, ease: EASE }
      : { duration: 0 },
  });
  const a = (deg: number) => deg + turn;
  const W = LABEL_X;
  const H = RING_BOTTOM + 10;
  const edgeIn = polar(a(sweepAt), SWEEP_IN);
  const edgeOut = polar(a(sweepAt), SWEEP_OUT);
  return (
    <svg
      className="rl-jarvis__ring"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
    >
      <defs>
        <radialGradient id={`${gid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="rl-jarvis__glowstop is-in" />
          <stop offset="100%" className="rl-jarvis__glowstop is-out" />
        </radialGradient>
      </defs>

      {/* Depth: a soft halo behind the core, in the HUD's blue — the answer's tone once landed. It breathes once settled (CSS, never motion). */}
      <circle
        cx={CX}
        cy={CY}
        r={RING_B + 26}
        fill={`url(#${gid}-core)`}
        className={`rl-jarvis__corehalo${breathe ? " is-breathing" : ""}`}
      />

      {/* The guide: a quiet full circle, the outer ticks drifting while the engine works, the major ticks drawn in turn. */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={R}
        className="rl-jarvis__guide"
        {...boot(0)}
      />
      <motion.circle
        cx={CX}
        cy={CY}
        r={R + 20}
        className="rl-jarvis__ticks"
        strokeDasharray="1 9"
        initial={play ? { opacity: 0 } : false}
        animate={
          idle
            ? { opacity: 1, strokeDashoffset: [0, -200] }
            : { opacity: 1, strokeDashoffset: -turn * 2 }
        }
        transition={
          idle
            ? {
                opacity: { duration: 0.6, delay: 0.2 },
                strokeDashoffset: {
                  duration: 18,
                  ease: "linear",
                  repeat: Infinity,
                },
              }
            : { duration: 0 }
        }
      />
      {MAJORS.map((deg, i) => {
        const p0 = polar(a(deg), R + 15);
        const p1 = polar(a(deg), R + 25);
        return (
          <motion.line
            key={deg}
            className="rl-jarvis__major"
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            initial={play ? { opacity: 0, pathLength: 0 } : false}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={
              play
                ? { duration: 0.22, delay: 0.08 + i * 0.035, ease: EASE }
                : { duration: 0 }
            }
          />
        );
      })}
      <motion.circle
        cx={CX}
        cy={CY}
        r={RING_B}
        className="rl-jarvis__ringb"
        strokeDasharray="14 6"
        initial={play ? { opacity: 0 } : false}
        animate={
          idle
            ? { opacity: 1, strokeDashoffset: [0, 120] }
            : { opacity: 1, strokeDashoffset: turn * 1.5 }
        }
        transition={
          idle
            ? {
                opacity: { duration: 0.5, delay: 0.1 },
                strokeDashoffset: {
                  duration: 9,
                  ease: "linear",
                  repeat: Infinity,
                },
              }
            : { duration: 0 }
        }
      />
      <motion.circle
        cx={CX}
        cy={CY}
        r={(RING_B + R) / 2 + 4}
        className="rl-jarvis__ringc"
        strokeDasharray="2 5"
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: play ? 0.6 : 0, delay: play ? 0.2 : 0 }}
      />
      <motion.circle
        cx={CX}
        cy={CY}
        r={RING_A}
        className="rl-jarvis__ringa"
        {...boot(1)}
      />

      {/* The engine core: a disc, its spinner turning while the engine works (a CSS spin on a group motion never touches), a dot at the heart. */}
      <motion.g
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: play ? 0.4 : 0, delay: play ? 0.1 : 0 }}
      >
        <circle cx={CX} cy={CY} r={CORE_R} className="rl-jarvis__coredisc" />
        {idle && (
          <g
            className="rl-jarvis__corespin"
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            <path
              className="rl-jarvis__corearc"
              d={arcPath(0, 110, CORE_R - 6)}
            />
            <path
              className="rl-jarvis__corearc is-b"
              d={arcPath(180, 250, CORE_R - 6)}
            />
          </g>
        )}
        <circle
          cx={CX}
          cy={CY}
          r={landed ? 6 : 4.5}
          className="rl-jarvis__coredot"
        />
      </motion.g>

      {/* Power on: one ping out from the core as the engine starts. */}
      {play && (
        <motion.circle
          cx={CX}
          cy={CY}
          className="rl-jarvis__ping"
          initial={{ r: CORE_R, opacity: 0.9 }}
          animate={{ r: R + 26, opacity: 0 }}
          transition={{
            duration: Math.max(0.7, (bootMs * 2.2) / 1000),
            ease: [0.2, 0, 0.4, 1],
          }}
        />
      )}

      {/* Landed: the answer comes home — one pulse out from the core in its tone. */}
      {play && landed && (
        <motion.circle
          cx={CX}
          cy={CY}
          className="rl-jarvis__landping"
          initial={{ r: RING_A, opacity: 0.85 }}
          animate={{ r: R + 22, opacity: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.2, 0, 0.4, 1] }}
        />
      )}

      {/* The sweep: a wedge from the core to the ring, turning to the policy being asked, a comet tail behind its edge. */}
      {sweeping && (
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
              d={sectorPath(
                a(sweepAt) - TAIL_DEG + (k * TAIL_DEG) / TAIL_N,
                a(sweepAt) - TAIL_DEG + ((k + 1) * TAIL_DEG) / TAIL_N + 0.4,
                SWEEP_IN,
                SWEEP_OUT,
              )}
            />
          ))}
          <path
            className="rl-jarvis__sweepedge"
            d={`M ${edgeIn.x} ${edgeIn.y} L ${edgeOut.x} ${edgeOut.y}`}
          />
          <circle
            className="rl-jarvis__sweephead"
            cx={edgeOut.x}
            cy={edgeOut.y}
            r={3}
          />
        </motion.g>
      )}

      {/* The policies: one arc each, then a leader to its label; the locked one bracketed, a glow behind it. */}
      {segs.map((g, i) => {
        const p = plan.policies[i];
        const st = states[i];
        const anchor = polar(a(g.mid), R + SEG_W / 2 + 2);
        const y = labelMid[i] ?? anchor.y;
        const toned = landed && st === "locked" ? ` is-${tone}` : "";
        const isLit = lit.has(p.node);
        const flicker = st === "passed" && play;
        const held = st === "locked" || st === "found";
        const glowAt = polar(a(g.mid), R);
        return (
          <g
            key={p.policyId}
            className={`rl-jarvis__seg is-${st}${toned}${isLit ? " is-lit" : ""}`}
          >
            {/* The lock's glow: its gradient lives inside the segment, so its stops take the segment's colour (currentColor). */}
            {held && (
              <>
                <radialGradient id={`${gid}-lock-${i}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" className="rl-jarvis__lockstop is-in" />
                  <stop offset="100%" className="rl-jarvis__lockstop is-out" />
                </radialGradient>
                <circle
                  className="rl-jarvis__lockglow"
                  cx={glowAt.x}
                  cy={glowAt.y}
                  r={34}
                  fill={`url(#${gid}-lock-${i})`}
                />
              </>
            )}
            <motion.path
              className="rl-jarvis__segarc"
              d={arcPath(a(g.a0), a(g.a1), R)}
              initial={play ? { pathLength: 0, opacity: 0 } : false}
              animate={
                flicker
                  ? { pathLength: 1, opacity: [1, 0.15, 0.85, 0.2, 1] }
                  : { pathLength: 1, opacity: 1 }
              }
              transition={
                play
                  ? flicker
                    ? {
                        opacity: {
                          duration: 0.34,
                          times: [0, 0.25, 0.5, 0.75, 1],
                        },
                        pathLength: { duration: 0 },
                      }
                    : {
                        duration: Math.max(0.3, bootMs / 1000),
                        delay: 0.16 + i * 0.07,
                        ease: EASE,
                      }
                  : { duration: 0 }
              }
            />
            {/* The lock: the arc bursts once, a soft pulse out from it. */}
            {play && held && (
              <motion.path
                className="rl-jarvis__segpulse"
                d={arcPath(a(g.a0), a(g.a1), R)}
                initial={{ strokeWidth: SEG_W, opacity: 0.7 }}
                animate={{ strokeWidth: SEG_W + 26, opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.2, 0, 0.3, 1] }}
              />
            )}
            {(held || st === "also") && (
              <motion.path
                className="rl-jarvis__segbracket"
                d={arcPath(a(g.a0) - 1, a(g.a1) + 1, R + 13)}
                initial={play ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: play ? 0.36 : 0, ease: EASE }}
              />
            )}
            <path
              className="rl-jarvis__leader"
              d={`M ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} L ${LABEL_X - 14} ${y} L ${LABEL_X - 3} ${y}`}
            />
          </g>
        );
      })}
    </svg>
  );
}

// --- The analysis panel -------------------------------------------------------------------

interface RowProps {
  r: EngineRule;
  s: number;
  play: boolean;
  landed: boolean;
  tone: Tone;
  all: boolean;
  lit: boolean;
  stepDur: number;
  onPeek: (id: string, el: HTMLElement | null, pin: boolean) => void;
  onUnpeek: (id: string) => void;
}

function RuleRow({
  r,
  s,
  play,
  landed,
  tone,
  all,
  lit,
  stepDur,
  onPeek,
  onUnpeek,
}: RowProps) {
  const res = traceResult(r, s);
  const look = rowLook(r, s, all);
  const n = r.index === null ? null : r.index + 1;
  const subExtra =
    all && res === "matched"
      ? r.checks.reduce(
          (h, c) => h + (c.subs.length > 1 ? c.subs.length * 22 : 0),
          0,
        )
      : 0;
  const height = rowHeight(look, subExtra);
  const reading = res === "reading";
  const rowWorking =
    reading && r.checks.some((_, k) => checkPhase(r, k, s) === "working");
  const missed = res === "missed" || res === "folded";
  const matched = res === "matched";
  const unknown = res === "unknown";
  const possible = res === "possible";
  /* Its colour: blue while read; the decision's tone once it matches (the route's, once landed); red a miss; amber can't tell. */
  const ruleTone = matched
    ? landed
      ? tone
      : decisionTone(r.decision)
    : possible
      ? "notice"
      : null;
  const cls = reading
    ? "is-working"
    : matched
      ? `is-matched is-${ruleTone}`
      : missed
        ? "is-missed"
        : unknown
          ? "is-unknown"
          : possible
            ? "is-possible is-notice"
            : res === "off"
              ? "is-off"
              : res === "not-reached"
                ? "is-quiet"
                : "is-waiting";
  const ref = useRef<HTMLDivElement | null>(null);
  const head = reading ? (
    rowWorking ? null : (
      <Busy label="Reading" />
    )
  ) : matched ? (
    <Mark status="pass" label="Matches" draw={play} />
  ) : missed ? (
    <Mark status="fail" label="No match" draw={play} />
  ) : unknown || possible ? (
    <Mark status="unknown" label={possible ? "If not" : "Can't tell"} />
  ) : null;
  const c = missed ? failingOf(r) : undefined;
  const sub =
    res === "off"
      ? "Switched off"
      : res === "folded"
        ? r.miss || c?.say || "No match"
        : "";
  const then =
    r.index === null && r.state === "possible"
      ? `If not · ${DECISION_WORDS[r.decision]}`
      : unknown
        ? `${DECISION_WORDS[r.decision]} · if it matches`
        : DECISION_WORDS[r.decision];
  const glitch = play && res === "missed";
  const label = `${n === null ? "Nothing else matched" : `Rule ${n}, ${r.name}`}: ${matched ? "matches" : missed ? "no match" : unknown ? "can't tell" : possible ? "if not" : res === "not-reached" ? "not reached" : res === "off" ? "switched off" : "waiting"}. Details`;
  return (
    <motion.div
      ref={ref}
      className={`rl-jarvis__rule ${cls}${lit ? " is-lit" : ""}`}
      data-node={r.node}
      data-jv={r.node}
      data-card
      initial={false}
      animate={{ height }}
      transition={{
        duration: play ? Math.max(0.16, (stepDur * 0.8) / 1000) : 0,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      <motion.div
        className="rl-jarvis__rulein"
        initial={false}
        animate={
          glitch
            ? { x: [0, -6, 5, -3, 2, 0], opacity: [1, 0.6, 1, 0.7, 1, 1] }
            : { x: 0, opacity: 1 }
        }
        transition={
          glitch ? { duration: 0.16, ease: "linear" } : { duration: 0 }
        }
      >
        <button
          type="button"
          className="rl-jarvis__rulehead"
          style={{
            height:
              res === "waiting" || res === "not-reached" ? QUIET_H : HEAD_H,
          }}
          aria-label={label}
          onPointerEnter={() => onPeek(r.node, ref.current, false)}
          onPointerLeave={() => onUnpeek(r.node)}
          onFocus={() => onPeek(r.node, ref.current, false)}
          onBlur={() => onUnpeek(r.node)}
          onClick={() => onPeek(r.node, ref.current, true)}
        >
          <span className="rl-jarvis__num">
            {n === null ? <Lock size={11} strokeWidth={2.2} aria-hidden /> : n}
          </span>
          <span className="rl-jarvis__rulename" title={r.name}>
            {r.index === null ? "Nothing else matched" : r.name}
          </span>
          {head}
        </button>
        {sub && (
          <p
            className="rl-jarvis__rulesub"
            style={{ height: SUB_H }}
            title={sub}
          >
            <Decode text={sub} play={play && res === "folded"} ms={300} />
          </p>
        )}
        {look.look === "open" && look.checks > 0 && (
          <ul className="rl-jarvis__checks">
            {r.checks.slice(0, look.checks).map((ck, k) => {
              const ph = all && matched ? "settled" : checkPhase(r, k, s);
              const shownPh = ph === "hidden" && matched ? "settled" : ph;
              if (shownPh === "hidden") return null;
              const working = shownPh === "working";
              const subs = all && matched && ck.subs.length > 1 ? ck.subs : [];
              return (
                <motion.li
                  key={ck.key || k}
                  className={`rl-jarvis__check${working ? " is-working" : ` is-${ck.status}`}`}
                  style={{ minHeight: CHECK_H }}
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: play ? 0.14 : 0 }}
                >
                  <span className="rl-jarvis__cword">{ck.word}</span>
                  <span className="rl-jarvis__ctext">
                    <span
                      className="rl-jarvis__cfact"
                      title={factOf(ck, r.via)}
                    >
                      {working ? (
                        <Decode text={factOf(ck, r.via)} play={play} ms={260} />
                      ) : (
                        factOf(ck, r.via)
                      )}
                    </span>
                    <span className="rl-jarvis__cneed" title={needOf(ck)}>
                      {needOf(ck)}
                    </span>
                    {subs.length > 0 && (
                      <span className="rl-jarvis__subs">
                        {subs.map((x) => (
                          <span
                            key={x.key}
                            className={`rl-jarvis__subline is-${x.status}`}
                          >
                            <span>{x.label}</span>
                            <span className="rl-jarvis__subval">
                              {x.actual || "Not stated"}
                            </span>
                            <Mark status={x.status} size={11} />
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {working ? (
                    <Busy label="Reading" />
                  ) : (
                    <Mark
                      status={ck.status}
                      label={ck.line || undefined}
                      draw={play}
                    />
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
        {look.look === "open" && look.then && (
          <p
            className={`rl-jarvis__then${ruleTone ? ` is-${ruleTone}` : unknown ? " is-notice" : ""}`}
            style={{ height: THEN_H }}
          >
            <span className="rl-jarvis__cword">Then</span>
            <span className="rl-jarvis__thenword">{then}</span>
          </p>
        )}
      </motion.div>
      {reading && play && (
        <motion.span
          className="rl-jarvis__scanline"
          aria-hidden
          initial={{ top: "0%", opacity: 0 }}
          animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
        />
      )}
      {(matched || (possible && landed)) && <Reticle play={play} gap={4} />}
      {/* The match locks: one pulse out from the row, in its colour. */}
      {matched && play && (
        <motion.span
          className="rl-jarvis__rowpulse"
          aria-hidden
          initial={{ opacity: 0.75, scale: 1 }}
          animate={{ opacity: 0, scale: 1.045 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.2, 0, 0.3, 1] }}
        />
      )}
    </motion.div>
  );
}

// --- The inspector: what a pressed or hovered piece says ------------------------------------

interface Peek {
  id: string;
  pin: boolean;
  x: number;
  y: number;
  side: "right" | "left" | "below";
}

/** An element's box in the world, by offsets (never a transformed rect). */
function boxIn(
  el: HTMLElement,
  world: HTMLElement,
): { x: number; y: number; w: number; h: number } | null {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== world) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n !== world) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// --- The layout ---------------------------------------------------------------------------

interface Ui {
  run: number;
  answer: Answer | null;
  see: boolean;
  all: boolean;
  peek: Peek | null;
}

export default function JarvisLayout(props: RunLayoutProps) {
  const {
    plan,
    s,
    running,
    animate,
    reduced,
    jumped,
    runKey,
    form,
    rows,
    asGroup,
    screens,
    onAsGroup,
    onAdd,
    onOpenRule,
    onOpenPolicy,
    onPressPerson,
  } = props;
  const { users, groups, apps, zones } = useBrand();
  const stage = useRef<StageView | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  const seeRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const at = plan.at;
  const lastStep = plan.steps.length - 1;
  const last = s >= lastStep;
  const landed = last || (at.outcome >= 0 && s >= at.outcome);
  const step = plan.steps[s];
  /* Motion for this frame: a run playing, never after Skip or under reduced motion. */
  const play = animate && !jumped && !reduced;
  const idle = play && running && !landed;
  const tone = toneOf(plan);
  const dur = stepMs(plan, s);

  // --- Jarvis's way in and out (jarvis-mode/): the HUD boots from the iris as the overlay dissolves, and stands down into it ---
  const [bootIn] = useState<number | null>(() => {
    const t = reduced ? null : jarvisEntering();
    return t === null ? null : Math.max(0, JARVIS_DISSOLVE_MS - 60 - t);
  });
  const [booting, setBooting] = useState(bootIn !== null);
  useEffect(() => {
    if (bootIn === null) return;
    const id = window.setTimeout(() => setBooting(false), bootIn + 900);
    return () => window.clearTimeout(id);
  }, [bootIn]);
  /* Depth: the far rings, the ground and the HUD drift apart a little as the pointer moves (off under reduced motion). */
  const rootRef = useRef<HTMLDivElement | null>(null);
  /* Standing down: marked straight on the root (an attribute React does not own), so the exit's first
     frames are not spent re-rendering a HUD that is about to go. */
  useEffect(() => {
    const on = () => {
      if (rootRef.current) rootRef.current.dataset.jvMode = "down";
    };
    window.addEventListener(JARVIS_EXIT_EVENT, on);
    return () => window.removeEventListener(JARVIS_EXIT_EVENT, on);
  }, []);
  useParallax(rootRef, !reduced);

  // --- Who, to what, on what ---
  const person = users.find((u) => u.id === form.personId) ?? null;
  const app = apps.find((a) => a.id === form.appId) ?? null;
  const personName = asGroup
    ? `A member of ${asGroup}`
    : (person?.name ?? plan.conflicts?.personName ?? "Someone");
  const first =
    asGroup ?? (person ? firstName(person.name) : firstName(personName));
  const groupLine = asGroup
    ? person
      ? `Tested as ${person.name}`
      : ""
    : person
      ? groupNamesOf(person, groups).join(" · ")
      : "";
  const facts = useMemo<Fact[]>(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows };
    return sentenceTokens(rows)
      .filter((t) => t !== "person" && t !== "app")
      .map((t) => {
        const v = tokenValue(t, form, ctx);
        return {
          token: t,
          field: TOKEN_FIELD[t] ?? "person",
          label: TOKEN_WORD[t] ?? v.label,
          value: v.unset ? "Not stated" : v.text,
          unset: v.unset,
        };
      });
  }, [rows, form, users, apps, zones]);

  // --- The pieces' states at s ---
  const deciderIdx = plan.policies.findIndex((p) => p.decides);
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined;
  const alsoIds = useMemo(
    () => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)),
    [plan.conflicts],
  );
  const conflictIds = useMemo(
    () =>
      new Set(
        (plan.conflicts?.findings ?? [])
          .filter(
            (f) =>
              f.tone === "conflict" &&
              (f.kind === "policy-conflict" || f.kind === "same-group-policy"),
          )
          .map((f) => f.target.policyId),
      ),
    [plan.conflicts],
  );
  const states = plan.policies.map((p) => polState(p, s, landed, alsoIds));
  const segs = useMemo(
    () => segmentsOf(plan.policies.length),
    [plan.policies.length],
  );
  const panelOpen = decider !== undefined && policyOpen(decider, s);
  const deciding = step?.kind === "deciding" && !landed;

  /* The sweep: from the first step until the one that decides has settled; on the policy being asked. */
  let sweepTo: number | null = null;
  if (
    !landed &&
    plan.policies.length > 0 &&
    (!decider || s < decider.settleAt + 1)
  ) {
    sweepTo = segs[0]?.a0 ?? 0;
    plan.policies.forEach((p, i) => {
      if (p.scanAt !== null && s >= p.scanAt) sweepTo = segs[i]?.mid ?? sweepTo;
    });
    if (decider && decider.foundAt !== null && s >= decider.foundAt)
      sweepTo = segs[deciderIdx]?.mid ?? sweepTo;
  }
  if (!play && sweepTo !== null && (decider ? s >= decider.settleAt : false))
    sweepTo = null;

  /* What the engine reads now: a condition in the strip, or the person (a Who) — and, once the check's
     mark has landed, what it found (the chip flashes its meaning for that step). */
  const reading = useMemo<{
    token: TokenId | "who";
    found: LineStatus | null;
  } | null>(() => {
    if (
      landed ||
      !step ||
      (step.kind !== "check" && step.kind !== "checked") ||
      step.rule === undefined ||
      step.check === undefined
    )
      return null;
    const c = plan.rules[step.rule]?.checks[step.check];
    if (!c) return null;
    const found = step.kind === "checked" ? c.status : null;
    if (c.category === "who") return { token: "who", found };
    const t = (Object.keys(TOKEN_CATS) as TokenId[]).find((k) =>
      TOKEN_CATS[k]?.includes(c.category),
    );
    return t ? { token: t, found } : null;
  }, [landed, step, plan.rules]);
  const marks = useMemo(() => (landed ? factMarks(plan) : {}), [landed, plan]);
  /* The conditions the rule that decided held: ticked on their chips once landed. */
  const heldCats = useMemo(() => {
    const r = plan.landing !== null ? plan.rules[plan.landing] : null;
    return new Set<string>(
      landed && r
        ? r.checks
            .slice(0, r.checked)
            .filter((c) => c.status === "pass")
            .map((c) => c.category)
        : [],
    );
  }, [landed, plan.landing, plan.rules]);

  // --- Per-run UI: an answer, What they see, every check, the inspector ---
  const [ui, setUi] = useState<Ui>({
    run: runKey,
    answer: null,
    see: false,
    all: false,
    peek: null,
  });
  const now: Ui =
    ui.run === runKey
      ? ui
      : { run: runKey, answer: null, see: false, all: false, peek: null };
  if (ui.run !== runKey) setUi(now);
  const lit = useMemo(() => new Set(now.answer?.lit ?? []), [now.answer]);

  // --- The policies' labels: measured once per plan, by offsets ---
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [labelH, setLabelH] = useState<number[]>([]);
  const sig = plan.policies.map((p) => p.name).join("|");
  useLayoutEffect(() => {
    const lh = plan.policies.map(
      (_, i) => labelRefs.current[i]?.offsetHeight ?? 52,
    );
    setLabelH((h) =>
      h.length === lh.length && h.every((v, i) => v === lh[i]) ? h : lh,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per plan's words
  }, [sig]);
  const labelTops = useMemo(() => {
    const nat = segs.map((g) => polar(g.mid, R + SEG_W).y);
    const hs = plan.policies.map((_, i) => labelH[i] ?? 52);
    /* 20 apart: the lock's reticle stands 4px proud of its label and the next one needs air below it; never up into the conditions. */
    return stack(nat, hs, 20, TOP - 4);
  }, [segs, plan.policies, labelH]);
  const labelMid = labelTops.map((t, i) => t + (labelH[i] ?? 52) / 2);

  // --- The world's size, from the plan: never grows under the eye while it plays ---
  const finding = heroFinding(plan);
  const panelMax = useMemo(() => panelHeightMax(plan), [plan]);
  const landing = landingOf(plan);
  const allExtra =
    now.all && landing
      ? landing.checks.reduce(
          (h, c) => h + (c.subs.length > 1 ? c.subs.length * 22 : 0),
          0,
        )
      : 0;
  const vH = verdictHeight(plan, finding !== null);
  const seeH = now.see ? 300 : 0;
  const worldH = Math.ceil(
    Math.max(
      RING_BOTTOM,
      ...labelTops.map((t, i) => t + (labelH[i] ?? 52)),
      TOP + panelMax + allExtra,
      TOP + vH + (seeH ? seeH + 14 : 0),
    ) + 6,
  );

  // --- The camera ---
  const fittedFor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const v = stage.current;
    if (!v) return;
    if (running && animate && !landed) {
      fittedFor.current = null;
      v.fit({ min: 1, max: 1, jump: true });
      v.follow(coreRef.current, { lazy: true, jump: true, x: 0 });
    } else {
      fittedFor.current = runKey;
      v.fit({ max: 1, jump: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey]);
  useEffect(() => {
    if (!running || landed) return;
    const k = step?.kind;
    const el =
      k === "deciding" || k === "outcome"
        ? verdictRef.current
        : panelOpen
          ? panelRef.current
          : coreRef.current;
    stage.current?.follow(el, { lazy: true, jump: reduced });
  }, [s, running, landed, step, panelOpen, reduced]);
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return;
    fittedFor.current = runKey;
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate });
  }, [landed, runKey, reduced, jumped, animate]);
  const settledNow = useRef(!running);
  settledNow.current = !running;
  useEffect(() => {
    const ground = worldRef.current?.closest(".rstage");
    if (!ground || typeof ResizeObserver === "undefined") return;
    let lastSize = "";
    let frame = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (size === lastSize) return;
      const firstTime = lastSize === "";
      lastSize = size;
      if (firstTime || !settledNow.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        stage.current?.fit({ max: 1, jump: true }),
      );
    });
    ro.observe(ground);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  /* The deck (the answer, subtitle, suggestions, command bar) is the room's floor: the world fits above it.
     An answer opening pulls the camera back so the card never sits over the HUD; closing it, the HUD comes forward again. */
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [deckH, setDeckH] = useState(0);
  useLayoutEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const read = () =>
      setDeckH((h) =>
        Math.abs(h - el.offsetHeight) < 2 ? h : el.offsetHeight,
      );
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* 66: the deck's distance from the bottom (jarvis.css); 10 clear above it. */
  const padBottom = Math.max(180, deckH + 66 + 10);
  /* After landing, the world grew (every check, What they see) or the deck did (an answer): frame it again.
     What they see opened, the camera stays at the words' size and goes to the card — it is the thing to read. */
  const framed = useRef({ worldH, padBottom, see: now.see });
  useEffect(() => {
    const f = framed.current;
    if (f.worldH === worldH && f.padBottom === padBottom && f.see === now.see)
      return;
    framed.current = { worldH, padBottom, see: now.see };
    if (!landed) return;
    const id = window.requestAnimationFrame(() => {
      const v = stage.current;
      if (!v) return;
      if (now.see && seeRef.current) {
        if (Math.abs(v.zoom() - 1) > 0.01)
          v.fit({ min: 1, max: 1, jump: true });
        v.follow(seeRef.current, { lazy: true, jump: reduced });
      } else v.fit({ max: 1, jump: reduced });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the world, the deck or What they see change after landing
  }, [worldH, padBottom, now.see]);

  // --- The voice ---
  const [voiceOn, setVoiceOn] = useState(readVoiceOn);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const [caption, setCaption] = useState<{ text: string; n: number } | null>(
    null,
  );
  const captionN = useRef(0);
  const voice = useRef<Voice | null>(null);
  if (voice.current === null) {
    voice.current = createVoice({
      onLine: (line) => setCaption({ text: line, n: ++captionN.current }),
    });
  }
  /* Unmounted: silence. (A remount in the same tick — React's strict mode — keeps the voice.) */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const v = voice.current;
      window.setTimeout(() => {
        if (!mounted.current) v?.cancel();
      }, 0);
    };
  }, []);
  const speak = useCallback((line: string, now = false) => {
    if (!line) return;
    if (!voiceOnRef.current) {
      setCaption({ text: line, n: ++captionN.current });
      return;
    }
    if (now) voice.current?.cancel();
    voice.current?.say(line);
  }, []);
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    writeVoiceOn(next);
    if (!next) voice.current?.cancel();
  };

  const askCtx = useMemo<AskContext>(
    () => ({
      plan,
      person: personName,
      first,
      isGroup: asGroup !== null,
      screens,
      groups: plan.asEachGroup?.groups ?? plan.conflicts?.groups ?? [],
      groupRows: eachGroupRows(plan),
      canGroup: typeof onAsGroup === "function" && asGroup === null,
      facts: facts.map((f) => ({
        field: f.field,
        label: f.label,
        value: f.value,
        unset: f.unset,
      })),
    }),
    [plan, personName, first, asGroup, screens, onAsGroup, facts],
  );

  /* The beats, once a run: the start, the lock, the rules, the verdict — or,
     a run that landed without playing, the answer alone. A revisit (mounted
     on a settled run) and Skip say nothing more. */
  /* Mounted on a settled run: a revisit stays silent — unless it is a sign-in never shown here that
     landed at once under reduced motion (the layout loads as Run is pressed), which says its one line. */
  const seenKey = `${runKey}:${form.personId ?? ""}:${form.appId ?? ""}:${asGroup ?? ""}`;
  const said = useRef<{ run: number; beats: Set<string> } | null>(null);
  if (said.current === null) {
    const fresh =
      running || (reduced && !jumped && !plan.empty && !SEEN.has(seenKey));
    said.current = fresh
      ? { run: -1, beats: new Set() }
      : {
          run: runKey,
          beats: new Set(["start", "lock", "rules", "verdict", "all"]),
        };
  }
  useEffect(() => {
    if (!plan.empty) SEEN.add(seenKey);
  }, [seenKey, plan.empty]);
  useEffect(() => {
    if (!said.current) return;
    const b = said.current;
    if (b.run !== runKey) {
      voice.current?.cancel();
      setCaption(null);
      said.current = { run: runKey, beats: new Set() };
    }
    const beats = said.current.beats;
    if (plan.empty) return;
    const once = (k: string, line: string | null) => {
      if (beats.has(k)) return;
      beats.add(k);
      if (line) speak(line);
    };
    if (jumped) {
      /* Skip: nothing more is said; the subtitle shows the verdict, silently. */
      if (!beats.has("verdict")) {
        voice.current?.cancel();
        ["start", "lock", "rules", "verdict", "all"].forEach((k) =>
          beats.add(k),
        );
        setCaption({ text: lineVerdict(askCtx), n: ++captionN.current });
      }
      return;
    }
    if (!running && !beats.has("start") && !beats.has("all")) {
      /* Landed without playing (reduced motion): one line. */
      ["start", "lock", "rules", "verdict"].forEach((k) => beats.add(k));
      once("all", lineAll(askCtx));
      return;
    }
    if (!running) return;
    if (reduced || (last && !beats.has("start"))) {
      ["start", "lock", "rules", "verdict"].forEach((k) => beats.add(k));
      once("all", lineAll(askCtx));
      return;
    }
    once("start", lineStart(askCtx));
    if (at.decides >= 0 && s >= at.decides) once("lock", lineLock(askCtx));
    /* The rules' line, as the rule that decides settles — said whole only if it fits before the verdict
       is due and the voice is free; else in short; else folded into the verdict ("Rule two matches. Access
       granted…"), so the voice never runs far behind the run. */
    const rulesAt = landing ? Math.max(landing.endAt, at.expand) : -1;
    if (rulesAt >= 0 && s >= rulesAt && s < at.outcome && !beats.has("rules")) {
      beats.add("rules");
      const full = lineRules(askCtx);
      const short = lineRulesShort(askCtx);
      let left = 0;
      for (let i = s; i < at.outcome; i++) left += stepMs(plan, i);
      const busy = voice.current?.speaking() === true;
      if (!voiceOnRef.current) speak(full ?? "");
      else if (!busy && full && estMs(full) <= left + 900) speak(full);
      else if (!busy && short && estMs(short) <= left + 900) speak(short);
      else beats.add("rules-folded");
    }
    if (at.outcome >= 0 && s >= at.outcome) {
      if (!beats.has("rules")) beats.add("rules-folded");
      beats.add("rules");
      const full = lineRules(askCtx);
      const fold =
        full && full.length <= 96
          ? full
          : (lineRulesShort(askCtx) ?? lineLanding(askCtx));
      once(
        "verdict",
        beats.has("rules-folded") && voiceOnRef.current
          ? `${fold} ${lineVerdict(askCtx)}`.trim()
          : lineVerdict(askCtx),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock and the run move the beats
  }, [s, runKey, running, jumped]);

  // --- Asking ---
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const hasMic = useMemo(() => canListen(), []);
  const chips = useMemo(
    () => (landed ? chipsOf(askCtx) : []),
    [landed, askCtx],
  );
  useEffect(() => () => stopListening.current?.(), []);

  const act = useCallback(
    (a: Answer) => {
      const x = a.act;
      if (!x) return;
      if (x.kind === "see") setUi((u) => ({ ...u, see: true }));
      else if (x.kind === "checks") setUi((u) => ({ ...u, all: true }));
      else if (x.kind === "group")
        window.setTimeout(() => onAsGroup?.(x.groupId), 450);
      else if (x.kind === "set") window.setTimeout(() => onAdd(x.field), 350);
      else if (x.kind === "open")
        window.setTimeout(
          () =>
            x.ruleId
              ? onOpenRule(x.policyId, x.ruleId)
              : onOpenPolicy(x.policyId),
          350,
        );
    },
    [onAsGroup, onAdd, onOpenRule, onOpenPolicy],
  );
  const ask = useCallback(
    (intent: Intent, queued = false) => {
      const a = answerOf(intent, askCtx);
      /* One answer at a time: another question puts What they see away, so the camera frames the HUD it lights. */
      setUi((u) => {
        const base =
          u.run === runKey
            ? u
            : { run: runKey, answer: null, see: false, all: false, peek: null };
        return {
          ...base,
          answer: a,
          peek: null,
          see: a.act?.kind === "see" ? base.see : false,
        };
      });
      /* Asked while the run played: said after the verdict, never over it. */
      speak(a.say, !queued);
      act(a);
    },
    [askCtx, runKey, speak, act],
  );
  /* An ask while the engine still works waits for the landing — the answer would give the run away. */
  const waitingAsk = useRef<{ run: number; intent: Intent } | null>(null);
  const [waitingFor, setWaitingFor] = useState<{
    run: number;
    text: string;
  } | null>(null);
  const submit = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const intent = matchIntent(t, askCtx);
    setText("");
    if (!landed) {
      waitingAsk.current = { run: runKey, intent };
      setWaitingFor({ run: runKey, text: t });
      return;
    }
    ask(intent);
  };
  useEffect(() => {
    if (!landed || !waitingAsk.current) return;
    const id = window.setTimeout(
      () => {
        const w = waitingAsk.current;
        waitingAsk.current = null;
        setWaitingFor(null);
        if (w && w.run === runKey) ask(w.intent, true);
      },
      reduced || jumped ? 0 : 500,
    );
    return () => window.clearTimeout(id);
  }, [landed, runKey, ask, reduced, jumped]);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(text);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      submit(text);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (text) setText("");
      else if (now.answer) setUi((u) => ({ ...u, answer: null }));
    }
  };
  const onMic = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    voice.current?.cancel();
    const stop = listenOnce({
      heard: (t, final) => {
        setText(t);
        if (final && t) {
          stopListening.current?.();
          submit(t);
        }
      },
      end: () => {
        setListening(false);
        stopListening.current = null;
      },
    });
    if (stop) {
      stopListening.current = stop;
      setListening(true);
    }
  };

  // --- The inspector ---
  const onPeek = useCallback(
    (id: string, el: HTMLElement | null, pin: boolean) => {
      const world = worldRef.current;
      if (!world || !el) return;
      const b = boxIn(el, world);
      if (!b) return;
      const W = 280;
      /* A rule's detail opens to its left, over the policy list, so it never covers the verdict. */
      /* The header's pieces (the person, a condition) open their detail below them, over the chart's top. */
      const below = id === "sign-in" || id.startsWith("fact:");
      const side: Peek["side"] = below
        ? "below"
        : id.startsWith("rule:") && b.x - 12 - W >= 0
          ? "left"
          : b.x + b.w + 12 + W <= WORLD_W + 40
            ? "right"
            : "left";
      const x =
        side === "below"
          ? Math.min(b.x, WORLD_W - W)
          : side === "right"
            ? b.x + b.w + 12
            : b.x - 12 - W;
      const y = side === "below" ? b.y + b.h + 8 : Math.max(0, b.y);
      setUi((u) => {
        if (pin && u.peek?.id === id && u.peek.pin) return { ...u, peek: null };
        if (!pin && u.peek?.pin) return u;
        return { ...u, peek: { id, pin, x, y, side } };
      });
    },
    [],
  );
  const onUnpeek = useCallback(
    (id: string) =>
      setUi((u) =>
        u.peek && u.peek.id === id && !u.peek.pin ? { ...u, peek: null } : u,
      ),
    [],
  );
  useEffect(() => {
    if (!now.peek?.pin) return;
    const onKeyDoc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as Element | null;
      if (t?.closest(".rl-jarvis__ask")) return;
      setUi((u) => ({ ...u, peek: null }));
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".rl-jarvis__peek, [data-jv]")) return;
      setUi((u) => ({ ...u, peek: null }));
    };
    document.addEventListener("keydown", onKeyDoc);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKeyDoc);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [now.peek?.pin]);

  // --- The ring's drag: it turns a little and springs back ---
  const spin = useMotionValue(0);
  const drag = useRef<{
    id: number;
    a0: number;
    moved: boolean;
    cx: number;
    cy: number;
  } | null>(null);
  const angleAt = (cx: number, cy: number, x: number, y: number) =>
    (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  const hitSeg = (deg: number): number => {
    const a = ((deg % 360) + 360) % 360;
    return segs.findIndex((g) => a >= g.a0 - 2 && a <= g.a1 + 2);
  };
  const onRingDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    drag.current = {
      id: e.pointerId,
      a0: angleAt(cx, cy, e.clientX, e.clientY),
      moved: false,
      cx,
      cy,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onRingMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (!d || d.id !== e.pointerId) {
      /* Hover: the segment under the pointer shows its detail. */
      const dist =
        Math.hypot(e.clientX - cx, e.clientY - cy) / (r.width / (2 * (R + 30)));
      const i =
        dist > R - 18 && dist < R + 26
          ? hitSeg(angleAt(cx, cy, e.clientX, e.clientY))
          : -1;
      const p = i >= 0 ? plan.policies[i] : undefined;
      if (p) onPeek(p.node, labelRefs.current[i], false);
      else if (now.peek && !now.peek.pin && now.peek.id.startsWith("policy:"))
        setUi((u) => ({ ...u, peek: u.peek?.pin ? u.peek : null }));
      return;
    }
    let delta = angleAt(d.cx, d.cy, e.clientX, e.clientY) - d.a0;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 2) d.moved = true;
    spin.set(Math.max(-28, Math.min(28, delta * 0.6)));
  };
  const onRingUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) {
      const r = e.currentTarget.getBoundingClientRect();
      const dist =
        Math.hypot(e.clientX - d.cx, e.clientY - d.cy) /
        (r.width / (2 * (R + 30)));
      const i =
        dist > R - 18 && dist < R + 26
          ? hitSeg(angleAt(d.cx, d.cy, e.clientX, e.clientY))
          : -1;
      const p = i >= 0 ? plan.policies[i] : undefined;
      if (p) onPeek(p.node, labelRefs.current[i], true);
    }
    if (reduced) spin.set(0);
    else
      animateValue(spin, 0, {
        type: "spring",
        stiffness: 170,
        damping: 11,
        mass: 0.8,
      });
  };

  // --- Words for the pieces ---
  const via = deciderVia(plan);
  /* One line under the name (the label's height never changes as the run plays): the lock is the first that covers, so "first" goes unsaid. */
  const lockWords = (p: EnginePolicy): string =>
    p.isGlobalDefault
      ? "Locked · none above covers"
      : `Locked · ${via ? via.say : `covers ${first}`}`;
  const statusOf = (p: EnginePolicy, st: PolState): string => {
    switch (st) {
      case "scan":
        return "Checking";
      case "found":
        return `Covers ${first}`;
      case "locked":
        return lockWords(p);
      case "passed":
        return reasonWords(p.reason) || "Not used";
      case "also":
        return `Also covers ${first} · not used`;
      case "quiet":
        return p.reason && !/^not reached$/i.test(p.reason) ? p.reason : "";
      default:
        return "";
    }
  };

  const peekBody = (id: string): ReactNode => {
    if (id === "sign-in")
      return (
        <PeekLines
          lines={[
            { text: personName },
            ...(groupLine ? [{ text: groupLine, quiet: true }] : []),
            { text: "Press to change the sign-in", quiet: true },
          ]}
        />
      );
    if (id.startsWith("fact:")) {
      const f = facts.find((x) => `fact:${x.field}` === id);
      if (!f) return null;
      const cats = TOKEN_CATS[f.token] ?? [];
      const readBy = plan.rules.filter(
        (r) =>
          r.visited &&
          r.checks.slice(0, r.checked).some((c) => cats.includes(c.category)),
      );
      return (
        <PeekLines
          lines={[
            { text: `${f.label} · ${f.value}` },
            ...readBy.map((r) => {
              const c = r.checks
                .slice(0, r.checked)
                .find((x) => cats.includes(x.category));
              return {
                text: `${r.index === null ? "Nothing else matched" : `Rule ${r.index + 1}`} · ${c?.line || c?.say || ""}`,
                mark: c?.status,
              };
            }),
            ...(readBy.length === 0
              ? [
                  {
                    text: landed
                      ? "No rule read it on this run"
                      : "Not read yet",
                    quiet: true,
                  },
                ]
              : []),
          ]}
        />
      );
    }
    if (id.startsWith("policy:")) {
      const i = plan.policies.findIndex((p) => p.node === id);
      const p = plan.policies[i];
      if (!p) return null;
      const st = states[i];
      const cover = plan.conflicts?.policies.find(
        (x) => x.policyId === p.policyId,
      );
      const lines: PeekLine[] = [{ text: `${p.order}. ${p.name}` }];
      if (p.decides) {
        lines.push({
          text: p.isGlobalDefault
            ? `No policy above it covers ${first}: the Global Default applies`
            : `The first policy on ${plan.appName} that covers ${first}${via ? `, ${via.say}` : ""}`,
          tone: landed ? tone : "positive",
        });
        if (landing)
          lines.push({
            text:
              landing.index === null
                ? "Nothing else matched"
                : `Rule ${landing.index + 1} · ${landing.name}`,
            quiet: true,
          });
      } else if (cover) {
        lines.push({
          text: `Also covers ${first}${cover.via.say ? ` ${cover.via.say}` : ""} · not used`,
          tone: "notice",
        });
        if (cover.status === "decided" && cover.decision)
          lines.push({
            text: `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ""}`,
            quiet: true,
          });
        if (cover.fix) lines.push({ text: cover.fix, quiet: true });
      } else if (st === "passed") {
        lines.push({ text: p.reason || "Not used" });
      } else {
        lines.push({
          text: decider
            ? `Not asked: ${decider.name} applies first`
            : p.reason || "Not asked",
          quiet: true,
        });
        if (p.reason && !/^not reached$/i.test(p.reason))
          lines.push({ text: p.reason, quiet: true });
      }
      if (p.tip && !p.decides) lines.push({ text: p.tip, quiet: true });
      return <PeekLines lines={lines} />;
    }
    if (id.startsWith("rule:")) {
      const r = plan.rules.find((x) => x.node === id);
      if (!r) return null;
      const res = traceResult(r, s);
      const read = r.checks.slice(
        0,
        Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0),
      );
      const lines: PeekLine[] = [
        {
          text:
            r.index === null
              ? "Nothing else matched"
              : `Rule ${r.index + 1} · ${r.name}`,
        },
      ];
      if (res === "not-reached" || res === "waiting") {
        const clash = plan.conflicts?.rules.find((x) => x.ruleId === r.id);
        lines.push({
          text:
            res === "waiting"
              ? "Not read yet"
              : landing && landing.index !== null
                ? `Not read: rule ${landing.index + 1} matched first`
                : "Not read",
          quiet: true,
        });
        if (clash && landed)
          lines.push({
            text: `${clash.match === "unknown" ? "Might apply" : "Also applies"} to ${first}${clash.via.say ? ` ${clash.via.say}` : ""} · not used`,
            tone: clash.kind === "conflict" ? "notice" : "neutral",
          });
        if (clash?.fix && landed) lines.push({ text: clash.fix, quiet: true });
      } else if (res === "off")
        lines.push({
          text: "Switched off: passed over, nothing asked",
          quiet: true,
        });
      else
        read.forEach((c) =>
          lines.push({
            text: `${c.word} · ${factOf(c, r.via)}`,
            sub: needOf(c),
            mark: c.status,
          }),
        );
      lines.push({ text: `Then · ${DECISION_WORDS[r.decision]}`, quiet: true });
      return <PeekLines lines={lines} />;
    }
    return null;
  };

  // --- The verdict's words ---
  const o = plan.outcome;
  const decided = o.status === "decided" && o.decision ? o.decision : null;
  const kicker = decided
    ? decided === "deny"
      ? "Access denied"
      : "Access granted"
    : o.status === "depends"
      ? "Can't tell yet"
      : "No decision";
  const word = decided
    ? DECISION_WORDS[decided]
    : o.status === "depends"
      ? `Depends on the ${o.view.needs.map((n) => n.toLowerCase()).join(" and ") || "facts"}`
      : "No policy decides";
  const factors = factorsOf(screens, decided);
  const denyMsg = decided === "deny" ? denyMessageOf(screens) : "";
  const where = landing
    ? landing.index === null
      ? "Nothing else matched"
      : `Rule ${landing.index + 1}`
    : "";
  const by = o.policyName
    ? `${o.policyName}${where && decided ? ` · ${where.replace(" ", " ")}` : ""}`
    : "";
  /* The rule under the policy, its name with it: which rule decided, read at a glance. */
  const byRule =
    decided && landing
      ? landing.index === null
        ? "Nothing else matched"
        : `Rule ${landing.index + 1} · ${landing.name}`
      : "";
  const openDecider = () => {
    if (!o.policyId) return;
    if (decided && landing && landing.index !== null)
      onOpenRule(o.policyId, landing.id);
    else onOpenPolicy(o.policyId);
  };
  const mark = expectMark(decided, props.expected, props.weaker);
  const frameMs = Math.min(520, stepMs(plan, Math.max(0, at.outcome)) * 0.45);

  // --- The wires: the route from the lock into the panel, from the rule out to the verdict ---
  const deciderLabelMid = deciderIdx >= 0 ? labelMid[deciderIdx] : null;
  const landingTop = useMemo(() => {
    if (!landing || plan.landing === null) return null;
    let y = TOP + PANEL_HEAD;
    for (let i = 0; i < plan.landing; i++)
      y += rowHeight(rowLook(plan.rules[i], s, now.all)) + ROW_GAP;
    return y;
  }, [landing, plan.landing, plan.rules, s, now.all]);
  const wireTone = landed ? `is-${tone}` : "is-drawn";
  const showOut = deciding || landed;

  const statusText = "Choose a person and an application";
  /* Who: the groups as chips; the ones that let the person in (the policy's audience, the deciding rule's Who) marked once landed. */
  const groupNames = asGroup
    ? [asGroup]
    : person
      ? groupNamesOf(person, groups)
      : [];
  const viaNames = new Set<string>(
    [
      ...(via?.groups ?? []),
      ...(landing?.via?.matches ? landing.via.groups : []),
    ].map((g) => g.name),
  );
  const whoOn = reading?.token === "who";
  const whoCls = whoOn
    ? reading?.found
      ? ` is-flash is-${reading.found}`
      : " is-working"
    : "";
  /* Settled and motion allowed: the core and the verdict's edge breathe. */
  const breathe = landed && !reduced;
  const answerShown =
    now.answer !== null && !(now.answer.act?.kind === "see" && now.see);

  const dock = (
    <>
      <Tip
        text={voiceOn ? "Mute the voice" : "Turn the voice on"}
        placement="top"
      >
        <button
          type="button"
          className={`bb__act rl-jarvis__voicebtn${voiceOn ? " is-on" : ""}`}
          aria-label="Voice"
          aria-pressed={voiceOn}
          onClick={toggleVoice}
        >
          {voiceOn ? (
            <Volume2 size={15} strokeWidth={2} aria-hidden />
          ) : (
            <VolumeX size={15} strokeWidth={2} aria-hidden />
          )}
        </button>
      </Tip>
    </>
  );

  const findingAsk: Intent | null = finding
    ? o.status === "depends"
      ? { kind: "depends" }
      : plan.conflicts?.rules.some((r) => r.kind === "conflict")
        ? {
            kind: "why-rule",
            rule: plan.conflicts.conflicts[0]?.number ?? null,
          }
        : { kind: "others" }
    : null;

  return (
    <div
      ref={rootRef}
      className={`rl-jarvis-root${landed ? ` is-landed is-tone-${tone}` : " is-running"}${booting ? " is-booting" : ""}`}
      data-stage="dark"
      style={
        bootIn !== null
          ? ({ "--jv-boot-delay": `${bootIn}ms` } as CSSProperties)
          : undefined
      }
    >
      {/* The stage: deep navy, its grid, a vignette — the room the HUD stands in. */}
      <motion.div
        className="rl-jarvis__stage"
        aria-hidden
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: play ? 0.28 : 0, ease: "easeOut" }}
      />
      <div className="rl-jarvis__vignette" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-jarvis"
        dock={dock}
        pad={{ top: 64, left: 32, right: 32, bottom: padBottom }}
        label={`Sign-in run: ${plan.appName}`}
      >
        <div
          key={runKey}
          ref={worldRef}
          className="rl-jarvis__world"
          style={{ width: WORLD_W, height: worldH } as CSSProperties}
        >
          {/* Depth: the far rings round the core, behind everything, drifting against the HUD as the pointer moves. */}
          <JarvisFar idle={idle} play={play} />
          {/* ROW 1 — WHO: the person (their face in a ring that draws), the name, their groups, the application; the HUD's status a small decoded label above the name. */}
          <div
            className={`rl-jarvis__id${whoCls}`}
            style={{ left: 0, top: 0, height: ID_H, width: WORLD_W }}
          >
            <button
              type="button"
              className={`rl-jarvis__face${whoCls}${lit.has("sign-in") ? " is-lit" : ""}`}
              data-node="sign-in"
              data-jv="sign-in"
              data-card
              style={{ width: FACE_R * 2, height: FACE_R * 2 }}
              aria-label={`${personName}${groupLine ? `, ${groupLine}` : ""}, signs in to ${plan.appName}. Change the sign-in`}
              onClick={onPressPerson}
              onPointerEnter={(e) => onPeek("sign-in", e.currentTarget, false)}
              onPointerLeave={() => onUnpeek("sign-in")}
              onFocus={(e) => onPeek("sign-in", e.currentTarget, false)}
              onBlur={() => onUnpeek("sign-in")}
            >
              <svg
                className="rl-jarvis__facering"
                width={FACE_R * 2 + 10}
                height={FACE_R * 2 + 10}
                viewBox={`0 0 ${FACE_R * 2 + 10} ${FACE_R * 2 + 10}`}
                aria-hidden
              >
                <circle
                  className="rl-jarvis__facetrack"
                  cx={FACE_R + 5}
                  cy={FACE_R + 5}
                  r={FACE_R + 3}
                />
                <motion.circle
                  className="rl-jarvis__facearc"
                  cx={FACE_R + 5}
                  cy={FACE_R + 5}
                  r={FACE_R + 3}
                  initial={play ? { pathLength: 0, opacity: 0 } : false}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    play ? { duration: 0.7, ease: EASE } : { duration: 0 }
                  }
                />
              </svg>
              <motion.span
                className="rl-jarvis__initials"
                initial={play ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: play ? 0.4 : 0, delay: play ? 0.2 : 0 }}
              >
                {initialsOf(asGroup ?? personName)}
              </motion.span>
            </button>
            <div className="rl-jarvis__idtext">
              <p
                className={`rl-jarvis__status${landed ? " is-done" : " is-working"}`}
              >
                {!landed && !plan.empty && <Busy label="Analysing" />}
                {landed && (
                  <Check
                    size={12}
                    strokeWidth={2.6}
                    aria-hidden
                    className="rl-jarvis__statusdone"
                  />
                )}
                {plan.empty ? (
                  <span>{statusText}</span>
                ) : (
                  <Decode
                    text={landed ? "Access analysed" : "Analysing access"}
                    play={play}
                    ms={320}
                  />
                )}
              </p>
              <div className="rl-jarvis__idline">
                <strong className="rl-jarvis__name" title={personName}>
                  <Decode text={personName} play={play} ms={420} delay={140} />
                </strong>
                {groupNames.length > 0 && (
                  <span
                    className="rl-jarvis__gchips"
                    aria-label={`Groups: ${groupNames.join(", ")}`}
                  >
                    {groupNames.map((g, i) => {
                      const isVia = landed && viaNames.has(g);
                      return (
                        <motion.span
                          key={g}
                          className={`rl-jarvis__gchip${isVia ? " is-via" : ""}`}
                          title={isVia ? `${g}: lets ${first} in` : g}
                          initial={play ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          transition={{
                            duration: play ? 0.3 : 0,
                            delay: play ? 0.3 + i * 0.08 : 0,
                          }}
                        >
                          {isVia && (
                            <Mark
                              status="pass"
                              size={11}
                              label={`Lets ${first} in`}
                              draw={play}
                            />
                          )}
                          {g}
                        </motion.span>
                      );
                    })}
                  </span>
                )}
                {asGroup && person && (
                  <span className="rl-jarvis__tested">
                    tested as {person.name}
                  </span>
                )}
                <motion.span
                  className="rl-jarvis__target"
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? 0.3 : 0,
                    delay: play ? 0.46 : 0,
                  }}
                >
                  <span className="rl-jarvis__to" aria-hidden>
                    →
                  </span>
                  {app && <AppLogo appId={app.id} name={app.name} size={18} />}
                  <span className="rl-jarvis__appname">{plan.appName}</span>
                </motion.span>
              </div>
            </div>
          </div>

          {/* ROW 2 — THE CONDITIONS of the whole sign-in: a strip across the chart. A chip lights as a check reads it. */}
          <div
            className="rl-jarvis__strip"
            style={{ left: 0, top: STRIP_TOP, height: STRIP_H, width: WORLD_W }}
          >
            <svg
              className="rl-jarvis__stripline"
              width={WORLD_W}
              height={STRIP_H}
              aria-hidden
            >
              <motion.path
                d={`M 0 ${STRIP_H - 0.5} H ${WORLD_W}`}
                initial={play ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={
                  play
                    ? { duration: 0.9, delay: 0.2, ease: EASE }
                    : { duration: 0 }
                }
              />
            </svg>
            <span className="rl-jarvis__striplabel">Conditions</span>
            {facts.length === 0 && (
              <span className="rl-jarvis__nocond">
                None read by these rules
              </span>
            )}
            {facts.map((f, i) => {
              const on = reading?.token === f.token;
              const state = on
                ? reading?.found
                  ? ` is-flash is-${reading.found}`
                  : " is-working"
                : "";
              const cats = TOKEN_CATS[f.token] ?? [];
              const m = (TOKEN_KEYS[f.token] ?? [])
                .map((k) => marks[k])
                .find(Boolean);
              const held = !m && cats.some((c) => heldCats.has(c));
              const Icon = TOKEN_ICON[f.token] ?? CircleHelp;
              const add = landed && f.unset;
              return (
                <motion.span
                  key={f.token}
                  className="rl-jarvis__condwrap"
                  initial={play ? { opacity: 0, y: 6, scale: 0.96 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    play
                      ? {
                          type: "spring",
                          stiffness: 380,
                          damping: 28,
                          delay: 0.38 + i * 0.12,
                        }
                      : { duration: 0 }
                  }
                >
                  <button
                    type="button"
                    className={`rl-jarvis__cond${state}${f.unset ? " is-unset" : ""}${lit.has(`fact:${f.field}`) ? " is-lit" : ""}`}
                    data-card
                    data-jv={`fact:${f.field}`}
                    aria-label={`${f.label}: ${f.value}.${add ? " Add it" : " Details"}`}
                    onPointerEnter={(e) =>
                      onPeek(`fact:${f.field}`, e.currentTarget, false)
                    }
                    onPointerLeave={() => onUnpeek(`fact:${f.field}`)}
                    onFocus={(e) =>
                      onPeek(`fact:${f.field}`, e.currentTarget, false)
                    }
                    onBlur={() => onUnpeek(`fact:${f.field}`)}
                    onClick={(e) =>
                      add
                        ? onAdd(f.field)
                        : onPeek(`fact:${f.field}`, e.currentTarget, true)
                    }
                  >
                    <span className="rl-jarvis__condin">
                      <Icon
                        size={14}
                        strokeWidth={2}
                        aria-hidden
                        className="rl-jarvis__condicon"
                      />
                      <span className="rl-jarvis__condlabel">{f.label}</span>
                      <span className="rl-jarvis__condvalue">{f.value}</span>
                      {m === "fail" && (
                        <Mark status="fail" size={12} label="Failed a check" />
                      )}
                      {m === "unknown" && (
                        <Mark status="unknown" size={12} label="Can't tell" />
                      )}
                      {held && (
                        <Mark
                          status="pass"
                          size={12}
                          label="Held by the rule that decided"
                        />
                      )}
                      {add && (
                        <span className="rl-jarvis__condadd">
                          <Plus size={12} strokeWidth={2.4} aria-hidden />
                          Add
                        </span>
                      )}
                    </span>
                    {play && (
                      <motion.span
                        className="rl-jarvis__condscan"
                        aria-hidden
                        initial={{ scaleX: 0, opacity: 1 }}
                        animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
                        transition={{
                          duration: 0.7,
                          delay: 0.5 + i * 0.12,
                          times: [0, 0.6, 1],
                          ease: "easeOut",
                        }}
                      />
                    )}
                  </button>
                </motion.span>
              );
            })}
          </div>

          {/* Where the camera follows while the engine works on the ring. */}
          <div
            ref={coreRef}
            className="rl-jarvis__slot"
            style={{
              left: 0,
              top: 0,
              width: LABEL_X + LABEL_W,
              height: RING_BOTTOM,
            }}
            aria-hidden
          />

          <Ring
            plan={plan}
            play={play}
            idle={idle}
            landed={landed}
            tone={tone}
            states={states}
            segs={segs}
            labelMid={labelMid}
            lit={lit}
            spin={spin}
            sweepTo={sweepTo}
            sweepMs={dur}
            bootMs={stepMs(plan, 0)}
            breathe={breathe}
          />

          {/* The ring's hit area: drag to turn it, hover or press a segment. */}
          <div
            className="rl-jarvis__ringhit"
            data-card
            style={{
              left: CX - R - 30,
              top: CY - R - 30,
              width: 2 * (R + 30),
              height: 2 * (R + 30),
            }}
            onPointerDown={onRingDown}
            onPointerMove={onRingMove}
            onPointerUp={onRingUp}
            onPointerCancel={onRingUp}
            onPointerLeave={() =>
              setUi((u) =>
                u.peek && !u.peek.pin && u.peek.id.startsWith("policy:")
                  ? { ...u, peek: null }
                  : u,
              )
            }
            aria-hidden
          />
          {/* The policies' labels, beside their segments. */}
          {plan.policies.map((p, i) => {
            const st = states[i];
            const words = statusOf(p, st);
            const conflict = st === "also" && conflictIds.has(p.policyId);
            const toned = landed && st === "locked" ? ` is-${tone}` : "";
            const isLit = lit.has(p.node);
            return (
              <div
                key={p.policyId}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                className={`rl-jarvis__plabel is-${st}${toned}${conflict ? " is-conflict" : ""}${isLit ? " is-lit" : ""}`}
                style={{
                  left: LABEL_X,
                  top: labelTops[i] ?? TOP,
                  width: LABEL_W,
                }}
                data-card
              >
                <motion.div
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? 0.3 : 0,
                    delay: play ? 0.22 + i * 0.07 : 0,
                  }}
                >
                  <button
                    type="button"
                    className="rl-jarvis__pbtn"
                    data-node={p.node}
                    data-jv={p.node}
                    aria-label={`Policy ${p.order}, ${p.name}${words ? `: ${words}` : ""}. Details`}
                    onPointerEnter={(e) =>
                      onPeek(p.node, e.currentTarget.parentElement, false)
                    }
                    onPointerLeave={() => onUnpeek(p.node)}
                    onFocus={(e) =>
                      onPeek(p.node, e.currentTarget.parentElement, false)
                    }
                    onBlur={() => onUnpeek(p.node)}
                    onClick={(e) =>
                      onPeek(p.node, e.currentTarget.parentElement, true)
                    }
                  >
                    <span className="rl-jarvis__pname">
                      <span className="rl-jarvis__pnum">{p.order}</span>
                      <span className="rl-jarvis__ptext" title={p.name}>
                        {p.name}
                      </span>
                    </span>
                    <motion.span
                      className="rl-jarvis__pstate"
                      title={words || undefined}
                      initial={false}
                      animate={
                        st === "passed" && play
                          ? { opacity: [0, 1, 0.3, 1] }
                          : st === "also" && play
                            ? { opacity: [0, 1, 0.4, 1, 0.5, 1] }
                            : { opacity: 1 }
                      }
                      transition={
                        play
                          ? { duration: st === "also" ? 0.9 : 0.34 }
                          : { duration: 0 }
                      }
                    >
                      {words ? (
                        <Decode
                          text={words}
                          play={play && st !== "quiet"}
                          ms={340}
                        />
                      ) : (
                        " "
                      )}
                    </motion.span>
                  </button>
                </motion.div>
                {/* Asked: a quick scan of light across the label. */}
                {play && st === "scan" && (
                  <span className="rl-jarvis__pscanbox" aria-hidden>
                    <motion.span
                      className="rl-jarvis__pscan"
                      initial={{ x: "-120%" }}
                      animate={{ x: "330%" }}
                      transition={{
                        duration: Math.max(0.3, (dur * 0.75) / 1000),
                        ease: [0.45, 0, 0.3, 1],
                      }}
                    />
                  </span>
                )}
                {(st === "found" || st === "locked") && (
                  <Reticle play={play} gap={4} />
                )}
                {/* The lock: a soft pulse out from the label as the reticle snaps in. */}
                {play && (st === "found" || st === "locked") && (
                  <motion.span
                    className="rl-jarvis__plock"
                    aria-hidden
                    initial={{ opacity: 0.7, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.09 }}
                    transition={{
                      duration: 0.7,
                      delay: 0.16,
                      ease: [0.2, 0, 0.3, 1],
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* The analysis panel: the locked policy, opened. */}
          <div
            ref={panelRef}
            className={`rl-jarvis__panelslot`}
            style={{
              left: PANEL_X,
              top: TOP,
              width: PANEL_W,
              minHeight: panelMax,
            }}
            aria-hidden={!panelOpen || undefined}
          >
            {!panelOpen && (
              <Frame
                label={
                  decider ? "Rules" : landed ? "No policy decides" : "Rules"
                }
                dim
                play={play}
              />
            )}
            {panelOpen && decider && (
              <motion.section
                className="rl-jarvis__panel"
                data-node="which"
                aria-label={`Rules in ${decider.name}`}
                initial={
                  play
                    ? { clipPath: "inset(0% 100% 0% 0%)", opacity: 0.4 }
                    : false
                }
                animate={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
                transition={{
                  duration: play
                    ? Math.max(0.28, stepMs(plan, at.expand) / 1000)
                    : 0,
                  ease: EASE,
                }}
              >
                {/* While the engine reads the rules, a slow scan runs down the panel (CSS; gone once landed). */}
                {idle && (
                  <span className="rl-jarvis__panelscan" aria-hidden>
                    <span className="rl-jarvis__panelscanline" />
                  </span>
                )}
                <header
                  className="rl-jarvis__panelhead"
                  style={{ height: PANEL_HEAD - 8 }}
                >
                  <span className="rl-jarvis__kicker">Rules in</span>
                  <span className="rl-jarvis__paneltitle" title={decider.name}>
                    <Decode text={decider.name} play={play} ms={400} />
                  </span>
                </header>
                <div
                  className="rl-jarvis__rows"
                  style={{ gap: ROW_GAP, paddingBottom: PANEL_PAD }}
                >
                  {plan.rules.map((r) => (
                    <RuleRow
                      key={r.id}
                      r={r}
                      s={s}
                      play={play}
                      landed={landed}
                      tone={tone}
                      all={now.all}
                      lit={lit.has(r.node)}
                      stepDur={dur}
                      onPeek={onPeek}
                      onUnpeek={onUnpeek}
                    />
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          {/* The verdict. */}
          <div
            ref={verdictRef}
            className="rl-jarvis__verdictslot"
            style={{
              left: VERDICT_X,
              top: TOP,
              width: VERDICT_W,
              minHeight: vH,
            }}
          >
            {!landed && (
              <Frame label="Verdict" dim play={play} working={deciding} />
            )}
            {landed && (
              <motion.section
                className={`rl-jarvis__verdict is-${tone}${lit.has("outcome") ? " is-lit" : ""}`}
                data-node="outcome"
                data-jv="outcome"
                data-card
                role="group"
                aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ""}`}
                initial={play ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: play ? 0.2 : 0 }}
              >
                {/* Depth: a soft glow in the verdict's tone behind its glass; settled, its edge breathes (CSS, never motion). */}
                <motion.span
                  className="rl-jarvis__vglow"
                  aria-hidden
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? 0.9 : 0,
                    delay: play ? 0.3 : 0,
                  }}
                />
                <span
                  className={`rl-jarvis__vbreath${breathe ? " is-breathing" : ""}`}
                  aria-hidden
                />
                {/* The frame draws itself, and the glass fills in behind it as it closes. */}
                <motion.span
                  className="rl-jarvis__vglass"
                  aria-hidden
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? Math.max(0.24, frameMs / 1000) : 0,
                    delay: play ? 0.08 : 0,
                    ease: "easeOut",
                  }}
                />
                <FrameLines play={play} ms={frameMs} />
                {/* Lock-on: four brackets close in on the verdict and let go; a scan assembles it top to bottom (CSS, once). */}
                {play && (
                  <span
                    className="rl-jarvis__lockon"
                    aria-hidden
                    style={{ "--jv-lock-at": `${Math.round(frameMs * 0.6)}ms` } as CSSProperties}
                  >
                    <span className="rl-jarvis__lc is-tl" />
                    <span className="rl-jarvis__lc is-tr" />
                    <span className="rl-jarvis__lc is-bl" />
                    <span className="rl-jarvis__lc is-br" />
                  </span>
                )}
                {play && (
                  <span className="rl-jarvis__vscan" aria-hidden>
                    <span className="rl-jarvis__vscanline" />
                  </span>
                )}
                {play && (
                  <motion.span
                    className="rl-jarvis__halo"
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.9, 0] }}
                    transition={{
                      duration: 1.1,
                      delay: 0.35,
                      times: [0, 0.3, 1],
                      ease: "easeOut",
                    }}
                  />
                )}
                {/* The answer lands: a ripple out from the frame, in its meaning colour. */}
                {play && (
                  <motion.span
                    className="rl-jarvis__ripple"
                    aria-hidden
                    initial={{ opacity: 0, scale: 1 }}
                    animate={{ opacity: [0, 0.7, 0], scale: [1, 1, 1.07] }}
                    transition={{
                      duration: 1.05,
                      delay: Math.max(0.24, frameMs / 1000) + 0.05,
                      times: [0, 0.12, 1],
                      ease: [0.2, 0, 0.3, 1],
                    }}
                  />
                )}
                <motion.div
                  className="rl-jarvis__verdictin"
                  initial={play ? "out" : false}
                  animate="in"
                  variants={{
                    out: {},
                    in: {
                      transition: play
                        ? { staggerChildren: 0.08, delayChildren: 0.22 }
                        : {},
                    },
                  }}
                >
                  <motion.p
                    className="rl-jarvis__vkicker"
                    variants={fade(play)}
                  >
                    <Decode text={kicker} play={play} ms={380} delay={200} />
                  </motion.p>
                  <motion.p className="rl-jarvis__vword" variants={fade(play)}>
                    <Decode text={word} play={play} ms={440} delay={260} />
                    {mark === "fails" && props.expected && (
                      <span className="rl-jarvis__expect">
                        Expected {DECISION_WORDS[props.expected]}
                      </span>
                    )}
                    {mark === "weaker" && (
                      <span className="rl-jarvis__expect">Weaker factor</span>
                    )}
                  </motion.p>
                  {factors.length > 0 && !denyMsg && (
                    <motion.p
                      className="rl-jarvis__factors"
                      variants={{
                        out: {},
                        in: {
                          transition: play
                            ? { staggerChildren: 0.11, delayChildren: 0.06 }
                            : {},
                        },
                      }}
                      aria-label="Asked for"
                    >
                      {factors.map((f, i) => (
                        <motion.span
                          key={`${f}:${i}`}
                          className="rl-jarvis__factorwrap"
                          variants={pop(play)}
                        >
                          {i > 0 && (
                            <span className="rl-jarvis__arrow" aria-hidden>
                              →
                            </span>
                          )}
                          <span className="rl-jarvis__factor">{f}</span>
                        </motion.span>
                      ))}
                    </motion.p>
                  )}
                  {denyMsg && (
                    <motion.p
                      className="rl-jarvis__deny"
                      variants={fade(play)}
                      title={denyMsg}
                    >
                      “{denyMsg}”
                    </motion.p>
                  )}
                  {o.status === "depends" && o.view.outcomes.length > 0 && (
                    <motion.ul className="rl-jarvis__ifs" variants={fade(play)}>
                      {o.view.outcomes.map((x) => (
                        <li key={`${x.label}:${x.decision}`}>
                          <span>{x.label}</span>
                          <span
                            className={`rl-jarvis__ifword is-${decisionTone(x.decision)}`}
                          >
                            {DECISION_WORDS[x.decision]}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                  {by && (
                    <motion.div className="rl-jarvis__by" variants={fade(play)}>
                      <span className="rl-jarvis__kicker">
                        {decided ? "Decided by" : "Policy"}
                      </span>
                      <button
                        type="button"
                        className="rl-jarvis__bylink"
                        onClick={openDecider}
                        aria-label={`Open ${by} in the builder`}
                        title={`Open ${where && decided ? `${where} of ` : ""}${o.policyName ?? "the policy"}`}
                      >
                        <span className="rl-jarvis__bytext">
                          <span className="rl-jarvis__bypolicy">
                            {o.policyName}
                          </span>
                          {byRule && (
                            <span className="rl-jarvis__byrule">{byRule}</span>
                          )}
                        </span>
                        <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                      </button>
                    </motion.div>
                  )}
                  {finding && (
                    <motion.button
                      type="button"
                      className={`rl-jarvis__finding is-${finding.tone === "info" ? "info" : "notice"}`}
                      variants={fade(play)}
                      onClick={() => findingAsk && ask(findingAsk)}
                    >
                      {finding.text}
                    </motion.button>
                  )}
                  {(props.changed || screens.length > 0) && (
                    <motion.div
                      className="rl-jarvis__vfoot"
                      variants={fade(play)}
                    >
                      {props.changed && (
                        <span className="rl-jarvis__changed">
                          Changed by {props.changed}
                        </span>
                      )}
                      {screens.length > 0 && form.appId && (
                        <button
                          type="button"
                          className={`rl-jarvis__seebtn${now.see ? " is-open" : ""}`}
                          aria-expanded={now.see}
                          onClick={() => setUi((u) => ({ ...u, see: !u.see }))}
                        >
                          What they see
                        </button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              </motion.section>
            )}
            {landed && now.see && screens.length > 0 && form.appId && (
              <motion.div
                ref={seeRef}
                className="rl-jarvis__see"
                data-card
                style={{ marginTop: 14 }}
                initial={
                  reduced
                    ? false
                    : { opacity: 0, clipPath: "inset(0% 0% 100% 0%)" }
                }
                animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }}
                transition={{ duration: reduced ? 0 : 0.32, ease: EASE }}
              >
                <div className="rl-jarvis__seehead">
                  <span className="rl-jarvis__kicker">What they see</span>
                  <button
                    type="button"
                    className="rl-jarvis__x"
                    aria-label="Close what they see"
                    onClick={() => setUi((u) => ({ ...u, see: false }))}
                  >
                    <X size={13} strokeWidth={2.2} aria-hidden />
                  </button>
                </div>
                <div className="rl-jarvis__seeinset">
                  <WhatTheySee
                    screens={screens}
                    appId={form.appId}
                    compact
                    collapsible={false}
                    title=""
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* The route: the lock into the panel, the rule out to the verdict — each drawn as its beat happens, a pulse running along it. */}
          <svg
            className="rl-jarvis__wires"
            width={WORLD_W}
            height={worldH}
            aria-hidden
          >
            {panelOpen && deciderLabelMid !== null && (
              <Wire
                d={elbow(
                  LABEL_X + LABEL_W + 2,
                  deciderLabelMid,
                  PANEL_X - 2,
                  TOP + PANEL_HEAD / 2 - 4,
                )}
                cls={landed ? wireTone : "is-covers"}
                play={play}
                flow={idle}
                ms={Math.max(260, stepMs(plan, at.expand) * 0.6)}
              />
            )}
            {showOut && landingTop !== null && (
              <Wire
                d={elbow(
                  PANEL_X + PANEL_W + 2,
                  landingTop + HEAD_H / 2,
                  VERDICT_X - 2,
                  TOP + 46,
                )}
                cls={landed ? wireTone : "is-working"}
                play={play}
                flow={idle}
                ms={Math.max(260, stepMs(plan, Math.max(0, at.outcome - 1)))}
              />
            )}
          </svg>

          {now.peek && (
            <motion.div
              className={`rl-jarvis__peek is-${now.peek.side}`}
              role="note"
              data-card
              style={{ left: now.peek.x, top: now.peek.y, width: 280 }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.14 }}
            >
              {peekBody(now.peek.id)}
              {now.peek.pin && (
                <button
                  type="button"
                  className="rl-jarvis__x rl-jarvis__peekx"
                  aria-label="Close"
                  onClick={() => {
                    const id = now.peek?.id;
                    setUi((u) => ({ ...u, peek: null }));
                    const back = id
                      ? worldRef.current?.querySelector<HTMLElement>(
                          `[data-jv="${id}"]`,
                        )
                      : null;
                    (back?.matches("button")
                      ? back
                      : back?.querySelector<HTMLElement>("button")
                    )?.focus();
                  }}
                >
                  <X size={12} strokeWidth={2.2} aria-hidden />
                </button>
              )}
            </motion.div>
          )}
        </div>
      </RunStage>

      {/* The deck: the answer, the subtitle, the suggestions, the command bar. */}
      <div ref={deckRef} className="rl-jarvis__deck">
        {answerShown && now.answer && (
          <AnswerCard
            key={`${now.answer.key}:${captionN.current}`}
            a={now.answer}
            play={!reduced}
            onClose={() => {
              setUi((u) => ({ ...u, answer: null }));
              inputRef.current?.focus();
            }}
          />
        )}
        {/* The subtitle; an answer's card carries its own words, so the line under it goes while it shows. */}
        <p
          className="rl-jarvis__caption"
          aria-hidden={!caption || undefined}
          hidden={answerShown || undefined}
        >
          {caption && (
            <>
              <span className="rl-jarvis__captionmark" aria-hidden>
                {voiceOn ? (
                  <Volume2 size={13} strokeWidth={2} />
                ) : (
                  <VolumeX size={13} strokeWidth={2} />
                )}
              </span>
              <Typed key={caption.n} text={caption.text} play={!reduced} />
            </>
          )}
        </p>
        {chips.length > 0 && (
          <div
            className="rl-jarvis__chips"
            role="group"
            aria-label="Ask about this sign-in"
          >
            {chips.map((c: Chip, i) => (
              <motion.button
                key={c.key}
                type="button"
                className={`rl-jarvis__chip${now.answer?.key === answerOf(c.intent, askCtx).key ? " is-on" : ""}`}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.24,
                  delay: reduced ? 0 : 0.5 + i * 0.05,
                  ease: EASE,
                }}
                onClick={() => ask(c.intent)}
              >
                {c.label}
              </motion.button>
            ))}
          </div>
        )}
        <form
          className={`rl-jarvis__ask${listening ? " is-listening" : ""}`}
          onSubmit={onSubmit}
          role="search"
        >
          <span
            className={`rl-jarvis__askmark${running && !landed ? " is-working" : ""}`}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle
                cx="9"
                cy="9"
                r="7.5"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="1"
              />
              <circle
                cx="9"
                cy="9"
                r="4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <circle cx="9" cy="9" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="rl-jarvis__input"
            type="text"
            value={text}
            placeholder={
              listening
                ? "Listening…"
                : waitingFor && waitingFor.run === runKey && !landed
                  ? `“${waitingFor.text}” · answering once the run lands`
                  : "Ask about this sign-in…"
            }
            aria-label="Ask about this sign-in"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            disabled={plan.empty}
          />
          {hasMic && (
            <button
              type="button"
              className={`rl-jarvis__mic${listening ? " is-on" : ""}`}
              aria-label={listening ? "Stop listening" : "Ask by voice"}
              aria-pressed={listening}
              onClick={onMic}
              disabled={plan.empty}
            >
              <Mic size={15} strokeWidth={2} aria-hidden />
            </button>
          )}
          <button
            type="submit"
            className="rl-jarvis__send"
            aria-label="Ask"
            disabled={!text.trim()}
          >
            <CornerDownLeft size={14} strokeWidth={2} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

const fade = (play: boolean) => ({
  out: { opacity: 0 },
  in: { opacity: 1, transition: { duration: play ? 0.26 : 0, ease: EASE } },
});
/* A chip popping in: up a few pixels and a touch larger, settling (on a span with no CSS transform). */
const pop = (play: boolean) => ({
  out: { opacity: 0, y: 6, scale: 0.94 },
  in: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: play
      ? { type: "spring" as const, stiffness: 420, damping: 26 }
      : { duration: 0 },
  },
});

/** A right-angled route between two points, its corners rounded. */
function elbow(x0: number, y0: number, x1: number, y1: number): string {
  const mx = Math.round((x0 + x1) / 2);
  if (Math.abs(y1 - y0) < 1) return `M ${x0} ${y0} H ${x1}`;
  const r = Math.min(8, Math.abs(y1 - y0) / 2, Math.abs(mx - x0));
  const dy = y1 > y0 ? 1 : -1;
  return `M ${x0} ${y0} H ${mx - r} Q ${mx} ${y0} ${mx} ${y0 + dy * r} V ${y1 - dy * r} Q ${mx} ${y1} ${mx + r} ${y1} H ${x1}`;
}

/* A connector: its line draws, a bright pulse runs ahead along it and fades at the far end. The pulse's
   head follows the path by its points (attributes written straight onto the dot — no transform, no render
   per frame); the line's colour is its group's (`color`), so a change of meaning never touches what moves. */
const TAILS = [0.3, 0.16, 0.07] as const;
/* How far past the end the pulse's head runs, so its tail leaves the line too. */
const RUN_ON = 0.32;

function Wire({
  d,
  cls,
  play,
  ms,
  flow = false,
}: {
  d: string;
  cls: string;
  play: boolean;
  ms: number;
  /** While the engine works: soft pulses keep travelling the line (CSS; gone once landed). */
  flow?: boolean;
}) {
  const measure = useRef<SVGPathElement | null>(null);
  const dot = useRef<SVGCircleElement | null>(null);
  const tails = useRef<(SVGPathElement | null)[]>([]);
  const line = useRef<SVGPathElement | null>(null);
  const t = useMotionValue(play ? 0 : 1 + RUN_ON);
  useMotionValueEvent(t, "change", (v) => {
    line.current?.setAttribute(
      "stroke-dashoffset",
      (1 - Math.min(1, v)).toFixed(4),
    );
    tails.current.forEach((el, k) =>
      el?.setAttribute("stroke-dashoffset", (TAILS[k] - v).toFixed(4)),
    );
    const p = measure.current;
    const c = dot.current;
    if (!p || !c) return;
    const pt = p.getPointAtLength(p.getTotalLength() * Math.min(1, v));
    c.setAttribute("cx", pt.x.toFixed(1));
    c.setAttribute("cy", pt.y.toFixed(1));
    c.setAttribute(
      "opacity",
      v >= 1 ? "0" : v > 0.88 ? ((1 - v) / 0.12).toFixed(2) : "1",
    );
  });
  useEffect(() => {
    /* Skip mid-pulse: the line is whole at once. */
    if (!play) {
      t.set(1 + RUN_ON);
      return;
    }
    const c = animateValue(t, 1 + RUN_ON, {
      duration: (ms * (1 + RUN_ON)) / 1000,
      ease: [0.45, 0.05, 0.35, 1],
    });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the wire appears, and on Skip
  }, [play]);
  return (
    <g className={`rl-jarvis__wire ${cls}`}>
      <path ref={measure} d={d} fill="none" stroke="none" />
      {/* The line's tip is the pulse's head: one value draws both. */}
      <path
        ref={line}
        className="rl-jarvis__wireline"
        d={d}
        pathLength={1}
        strokeDasharray="1 2"
        strokeDashoffset={play ? 1 : 0}
      />
      {flow && (
        <path
          className="rl-jarvis__wireflow"
          d={d}
          pathLength={1}
          strokeDasharray="0.06 0.34"
        />
      )}
      {play &&
        TAILS.map((len, k) => (
          <path
            key={len}
            ref={(el) => {
              tails.current[k] = el;
            }}
            className={`rl-jarvis__wiretail is-t${k}`}
            d={d}
            pathLength={1}
            strokeDasharray={`${len} 3`}
            strokeDashoffset={len}
          />
        ))}
      {play && (
        <circle
          ref={dot}
          className="rl-jarvis__wiredot"
          r={3.6}
          cx={-20}
          cy={-20}
          opacity={0}
        />
      )}
    </g>
  );
}

/* A panel's place before it opens: its corners, faint — the HUD's empty slot. */
function Frame({
  label,
  dim,
  play,
  working = false,
}: {
  label: string;
  dim?: boolean;
  play: boolean;
  working?: boolean;
}) {
  return (
    <motion.div
      className={`rl-jarvis__frame${dim ? " is-dim" : ""}${working ? " is-working" : ""}`}
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.5 : 0, delay: play ? 0.25 : 0 }}
    >
      <span className="rl-jarvis__framelabel">{label}</span>
      {working && <Busy label="Deciding" />}
      <span className="rl-jarvis__fc is-tl" />
      <span className="rl-jarvis__fc is-tr" />
      <span className="rl-jarvis__fc is-bl" />
      <span className="rl-jarvis__fc is-br" />
    </motion.div>
  );
}

/* The verdict's frame drawing itself: one rectangle traced round. */
function FrameLines({ play, ms }: { play: boolean; ms: number }) {
  return (
    <svg
      className="rl-jarvis__framelines"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden
    >
      <motion.rect
        x="0.5"
        y="0.5"
        rx="10"
        ry="10"
        style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
        fill="none"
        initial={play ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{
          duration: play ? Math.max(0.24, ms / 1000) : 0,
          ease: EASE,
        }}
      />
    </svg>
  );
}

interface PeekLine {
  text: string;
  sub?: string;
  mark?: LineStatus;
  tone?: Tone;
  quiet?: boolean;
}

function PeekLines({ lines }: { lines: readonly PeekLine[] }) {
  return (
    <ul className="rl-jarvis__peeklines">
      {lines.map((l, i) => (
        <li
          key={`${i}:${l.text}`}
          className={`${i === 0 ? "is-lead" : ""}${l.quiet ? " is-quiet" : ""}${l.tone ? ` is-${l.tone}` : ""}`}
        >
          <span className="rl-jarvis__peektext">
            {l.text}
            {l.sub && <span className="rl-jarvis__peeksub">{l.sub}</span>}
          </span>
          {l.mark && <Mark status={l.mark} size={12} />}
        </li>
      ))}
    </ul>
  );
}

function AnswerCard({
  a,
  play,
  onClose,
}: {
  a: Answer;
  play: boolean;
  onClose: () => void;
}) {
  return (
    <motion.section
      className={`rl-jarvis__answer is-${a.tone}`}
      role="status"
      aria-label={a.title}
      initial={play ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: play ? 0.26 : 0, ease: EASE }}
    >
      <header className="rl-jarvis__answerhead">
        <span className="rl-jarvis__answertitle">
          <Decode text={a.title} play={play} ms={360} />
        </span>
        <button
          type="button"
          className="rl-jarvis__x"
          aria-label="Close the answer"
          onClick={onClose}
        >
          <X size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </header>
      <motion.ul
        className="rl-jarvis__answerlines"
        initial={play ? "out" : false}
        animate="in"
        variants={{
          out: {},
          in: {
            transition: play
              ? { staggerChildren: 0.06, delayChildren: 0.12 }
              : {},
          },
        }}
      >
        {a.lines.map((l, i) => (
          <motion.li
            key={`${i}:${l.text}`}
            className={l.tone ? `is-${l.tone}` : undefined}
            variants={fade(play)}
          >
            <span className="rl-jarvis__peektext">
              {l.text}
              {l.sub && <span className="rl-jarvis__peeksub">{l.sub}</span>}
            </span>
            {l.mark && <Mark status={l.mark} size={12} />}
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}
