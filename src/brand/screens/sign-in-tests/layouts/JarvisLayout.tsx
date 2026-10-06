import {
  animate as animateValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
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
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Lock,
  MessageCircleQuestion,
  Moon,
  Play,
  Plus,
  ShieldAlert,
  Sun,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { DECISION_WORDS } from "../../../decision-words";
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
  type EnginePolicy,
  type EngineRule,
} from "../engine-run";
import { eachGroupRows, expectMark, traceResult } from "../journey";
import { stepMs } from "../use-engine-run";
import { DockButton } from "./assistant/AssistantDock";
import { useWhatIfs } from "./assistant/what-if";
import {
  didLine,
  isRunAction,
  runAction,
  type Action,
  type Answer,
  type AskProps,
  type Target,
} from "./assistant/intents";
import { noticeOf } from "./jarvis1-notice";
import { JARVIS_PERSONA, useNarrator } from "./assistant/voice";
import { Decode } from "./jarvis-decode";
import {
  CHECK_H,
  CY,
  HEAD_H,
  LABEL_W,
  LABEL_X,
  NAMEPLATE_H,
  PANEL_HEAD,
  PANEL_PAD,
  PANEL_W,
  PANEL_X,
  QUIET_H,
  R,
  RING_BOTTOM,
  ROW_GAP,
  STACK_COL,
  STACK_GAP,
  STACK_W,
  SUB_H,
  THEN_H,
  TOP,
  VERDICT_W,
  VERDICT_X,
  WORLD_W,
  bracket,
  panelHeightMax,
  polar,
  rowHeight,
  rowLook,
  segmentsOf,
  stack,
  stackedAt,
  verdictHeight,
} from "./jarvis1-geometry";
import {
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
  needOf,
  toneOf,
  type AskContext,
  type Tone,
} from "./jarvis-intents";
import { ArunaAsk } from "./jarvis1-ask";
import type { FaqRow } from "./focus2-faq";
import { ARUNA_ASK_PAD, EACH_GROUP, questionsOf, rowOf } from "./jarvis1-ask-model";
import { litOf } from "./jarvis1-lit";
import { RunStage, type StageView } from "./RunStage";
import { rowFacts } from "./shared/sign-in-row";
import { JarvisHub } from "./jarvis1-hub";
import { FLAT, TILT, projector } from "./jarvis1-tilt";
import {
  JARVIS_DISSOLVE_MS,
  JARVIS_EXIT_EVENT,
  jarvisEntering,
  jarvisJustEntered,
} from "../jarvis-mode/jarvis-timing";
import { useJarvisStage } from "./jarvis1-stage";
import {
  CopilotMark,
  Nameplate,
  type Presence,
} from "./jarvis1-presence";
import { COPILOT_NAME } from "../jarvis-mode/copilot-name";
import { STAGE_FROM_TOP } from "../canvas-shelf";
import { SignInRow } from "./shared/SignInRow";
import type { RunLayoutProps } from "./types";
import "./jarvis.css";

/* -----------------------------------------------------------------------------
   The run as JARVIS (run-layout.ts `jarvis`): the access assistant's HUD.

   A dimmed stage of fine holographic linework. The engine is the core, like
   an arc reactor; the application's policies are arc segments of its right
   half, in reading order from 12 o'clock. A radar sweep turns to each policy
   as the engine asks it — one that does not cover the person flickers and
   dims, the first that does is locked by a reticle. It expands into the
   analysis panel: its rules in order, each scanned, its checks resolving one
   by one; a miss glitches and settles red, the first match locks. The
   verdict assembles at the right.

   THE CIRCLE is the engine's alone (jarvis1-hub.tsx). For one day — 4 Oct
   2026 — it was the sign-in too: the person at its core, the application
   docked at the gate, the conditions orbiting as chips, with the pencil and
   Replay on the core and no run line above. The owner reversed it ("revert
   the circle, and give me the old top bar as we have in Focus"), because the
   run line above the canvas states the sign-in for every other view and this
   canvas said it twice. So the circle is the core, her presence round it, and
   the policies as the band's segments — hover or focus one for its tooltip,
   press it to put its rules in view (the labels are the ring's one tab stop:
   arrows go round, Esc back). Layered in 3D, tilted, easing toward the
   pointer (jarvis1-tilt.ts); flat and still under reduced motion. HER CHAT
   stays at the bottom (jarvis1-ask.tsx, in the dock's frame and HUD look):
   the questions this run can answer, asked by a press — no field to type
   in — and Aruna's voice saying the run's beats.

   Jarvis ACTS on what it is asked (SPEC D): the shared words decide the
   answer and the press (assistant/intents.ts — "run as Finance only" runs,
   "why denied?" answers and offers Open rule 2); this view lights what each
   answer is about (jarvis1-lit.ts): the route pulses and the reticle closes
   again on a why, a rule row opens on "why not rule 1?", the unknown fact
   rings amber on a Depends, What they see opens on "what will she see?",
   every check shows on "show every check".

   The COPILOT (owner, 3 Oct 2026: a companion-type experience; the name
   is jarvis-mode/copilot-name.ts COPILOT_NAME): the reactor core is its
   presence (jarvis1-presence.tsx) — rings close in while it listens, breathe
   out while it speaks, an arc turns while it reads a question — with its name
   and state in a word on the nameplate under the ring, and the same mark at
   the head of her chat's bar. It names itself once a session (as the HUD
   comes up, or folded into the first run it narrates), says at most ONE thing
   it noticed after the verdict (jarvis1-notice.ts: shown on the verdict's
   Noticed line with its one press), says what it does before it acts
   ("Running as Finance only."), and remembers this visit in her
   thread: a divider per run and a receipt on landing ("Allow with 2FA. Run 1
   was Allow on 1 factor."), earlier answers inert. Two stages (jarvis1-stage.ts, the page's one
   setting): dark, ember on warm near-black; light, the console's brand (jarvis.css).

   Colour is meaning, on both stages: the engine's orange only on what it
   works on now (the sweep, the lock while it plays, the fact and the row
   being read) and on Aruna's chrome; green covers / matches / ✓ / an allow;
   crimson ✕ / a deny; lemon (with ⚠ and dashes) a conflict or can't tell;
   grey not reached. Once landed the orange is gone from the run and the core
   and its locked segment take the answer's one tone.

   Everything is drawn from `s` (engine-run.ts, journey.ts); durations from
   `stepMs`. Motion animates only transform-free properties or elements with
   no CSS transform or transition of their own. Geometry is fixed by the plan
   (jarvis1-geometry.ts), so nothing is measured off transformed boxes.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const;
/* The sign-ins this page has already shown here: a remount on one of them (a
   revisit, the canvas switched back) says nothing again. */
const SEEN = new Set<string>();
/** About how long a line takes to say, at the voice's rate. */
const estMs = (line: string) => line.length * 64 + 250;
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;
/* The copilot greets once a browser session (sessionStorage; this flag where storage is refused). */
const GREET_KEY = "idp.jarvis.greeted";
let greetedHere = false;
function greeted(): boolean {
  try {
    return window.sessionStorage.getItem(GREET_KEY) === "1" || greetedHere;
  } catch {
    return greetedHere;
  }
}
function markGreeted(): void {
  greetedHere = true;
  try {
    window.sessionStorage.setItem(GREET_KEY, "1");
  } catch {
    /* Storage refused: the flag holds for this page. */
  }
}
/** What the copilot noticed, said as a line: the plan's own finding, in sentences. */
function noticeLine(text: string): string {
  const said = text
    .split(/\s+[—–]\s+/)
    .map((p) => p.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(". ");
  return said ? `One thing to know. ${said}.` : "";
}

/* The sign-in's facts, for the voice's words (jarvis-intents.ts AskContext). */
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

interface Fact {
  token: TokenId;
  field: FormField;
  label: string;
  value: string;
  unset: boolean;
}

/* What one line of a label's state holds, in characters (12px, the label's width less its number and padding). */
const STATE_LINE_CHARS = 20;

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
  /* Can't tell is lemon AND a triangle: the shape carries it too, apart from the orange engine. */
  unknown: { Icon: TriangleAlert, label: "Can't tell" },
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

/* The policies' band on the hub (jarvis1-hub.tsx): its width, for where a label's leader leaves it. */
const SEG_W = 10;

// --- The analysis panel -------------------------------------------------------------------

interface RowProps {
  r: EngineRule;
  s: number;
  play: boolean;
  landed: boolean;
  tone: Tone;
  all: boolean;
  lit: boolean;
  /** Check rows lit by an answer: `${ruleId}:${category}`. */
  litChecks: ReadonlySet<string>;
  /** Opened by an answer: a folded miss shows its checks again. */
  opened: boolean;
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
  litChecks,
  opened,
  stepDur,
  onPeek,
  onUnpeek,
}: RowProps) {
  const res = traceResult(r, s, opened);
  const look = rowLook(r, s, all, opened);
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
                  className={`rl-jarvis__check${working ? " is-working" : ` is-${ck.status}`}${litChecks.has(`${r.id}:${ck.category}`) ? " is-lit" : ""}`}
                  data-jv={`check:${r.id}:${ck.category}`}
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
  side: "right" | "left";
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
  /** The dock's answer on show (null: folded, or none asked). */
  answer: Answer | null;
  /** Counts the answers shown: a reticle or the route plays again for each. */
  seq: number;
  /** A citation hovered in the chat. */
  cite: Target | null;
  see: boolean;
  all: boolean;
  peek: Peek | null;
  /** The policy pressed into view on the ring (its index; null: the one that decides). */
  inView: number | null;
}

const freshUi = (run: number): Ui => ({
  run,
  answer: null,
  seq: 0,
  cite: null,
  see: false,
  all: false,
  peek: null,
  inView: null,
});

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
    onOpenRule,
    onOpenPolicy,
    breakIn,
    onReviewBreakIn,
  } = props;
  const { users, apps, zones } = useBrand();
  const stage = useRef<StageView | null>(null);
  /* The stage, light (the console's brand) or dark (ember on warm near-black): one setting for every cinematic layout. */
  const [look, setLook] = useJarvisStage();
  const dark = look === "dark";
  const worldRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  const seeRef = useRef<HTMLDivElement | null>(null);

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

  // --- Who, to what, on what ---
  const person = users.find((u) => u.id === form.personId) ?? null;
  const personName = asGroup
    ? `A member of ${asGroup}`
    : (person?.name ?? plan.conflicts?.personName ?? "Someone");
  const first =
    asGroup ?? (person ? firstName(person.name) : firstName(personName));
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
  /* The sign-in states a place apart from the network (so a place check reads the place, not the address). */
  const hasPlace = useMemo(
    () => rowFacts(form, rows, { zones }).some((f) => f.field === "place"),
    [form, rows, zones],
  );

  /* The circle fed on the sign-in until 4 Oct 2026 — who at its core, the app at its gate, the facts as chips
     on its orbit and one state tag under the name. The owner put the sign-in back on the run line above the
     canvas, so the circle asks for none of it and every one of those feeds went with it. */

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

  /* What the engine reads now lit the fact's chip on the circle, and ringed the orb for a Who. Both left with
     the sign-in (4 Oct 2026), so the check's own row at work ("Reading") in the analysis panel states it. */

  // --- Per-run UI: the answer on show, What they see, every check, the inspector ---
  const [ui, setUi] = useState<Ui>(() => freshUi(runKey));
  const now: Ui = ui.run === runKey ? ui : freshUi(runKey);
  if (ui.run !== runKey) setUi(now);
  /* The ring: the segment the pointer is on, and the one the keyboard is on (one tab stop, arrows round it). */
  const [hover, setHover] = useState<number | null>(null);
  const [ringAt, setRingAt] = useState<number | null>(null);
  const [ringFocus, setRingFocus] = useState(false);
  /* The policy in view: pressed on the ring once the run has landed (null: the one that decides). Nothing runs. */
  const viewIdx =
    landed &&
    !running &&
    now.inView !== null &&
    now.inView !== deciderIdx &&
    now.inView < plan.policies.length
      ? now.inView
      : null;
  const viewPol = viewIdx !== null ? plan.policies[viewIdx] : undefined;
  const activeRing =
    ringAt !== null && ringAt < plan.policies.length
      ? ringAt
      : deciderIdx >= 0
        ? deciderIdx
        : 0;
  const ringHover = hover ?? (ringFocus ? activeRing : null);
  const onHubHover = useCallback((i: number | null) => setHover(i), []);
  const lockAt = useCallback(
    (i: number) => {
      /* While it plays the ring shows the engine's own walk: a press waits for the answer. */
      if (running && !landed) return;
      setUi((u) => {
        const base = u.run === runKey ? u : freshUi(runKey);
        return { ...base, peek: null, inView: i === deciderIdx ? null : i };
      });
    },
    [running, landed, runKey, deciderIdx],
  );
  /* The tooltip under a label: 120 ms after hover or focus lands on a policy. */
  const tipWant = ringHover;
  const [tipAt, setTipAt] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setTipAt(tipWant), tipWant === null ? 0 : 120);
    return () => window.clearTimeout(id);
  }, [tipWant]);
  /* Esc puts the policy in view back to the one that decides (the dock keeps its own Esc). */
  useEffect(() => {
    if (viewIdx === null) return;
    const onKeyDoc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as Element | null;
      if (t?.closest(".ad")) return;
      setUi((u) => ({ ...u, inView: null }));
    };
    document.addEventListener("keydown", onKeyDoc);
    return () => document.removeEventListener("keydown", onKeyDoc);
  }, [viewIdx]);
  /* What it noticed: at most one thing, after the verdict (jarvis1-notice.ts). */
  const { asGroup: g0, screens: sc0, form: f0, rows: r0, breakIn: b0, onAsGroup: oa, onAdd: od, onOpenRule: or, onOpenPolicy: op, onRunWith: ow, onReplay: orp, onPressPerson: opp, onReviewBreakIn: orb, onSave: os } = props;
  const askLite = useMemo<AskProps>(
    () => ({ asGroup: g0, screens: sc0, form: f0, rows: r0, breakIn: b0, onAsGroup: oa, onAdd: od, onOpenRule: or, onOpenPolicy: op, onRunWith: ow, onReplay: orp, onPressPerson: opp, onReviewBreakIn: orb, onSave: os }),
    [g0, sc0, f0, r0, b0, oa, od, or, op, ow, orp, opp, orb, os],
  );
  const notice = useMemo(() => (landed ? noticeOf(plan, askLite) : null), [landed, plan, askLite]);
  /* Her chat's questions are the run's own (jarvis1-ask-model.ts → focus2-faq.ts): offered once the run has landed AND
     settled, with the previews that "What would change the answer?" is read from — worked out only then, never
     changing the page's sign-in. */
  const ready = !running && !plan.empty && s >= plan.at.done;
  const whatIfs = useWhatIfs(form, props.rows, plan, ready, props.policies);
  const askProps = useMemo<AskProps>(
    () => ({ ...askLite, whatIfs: ready ? whatIfs.list : undefined, preview: ready ? whatIfs.preview : undefined }),
    [askLite, whatIfs, ready],
  );
  const groups = useMemo(() => questionsOf(plan, askProps, ready), [plan, askProps, ready]);
  /* "What does each group get?" beside "Run as Finance only": the chat's own ask, so the answer lands in her thread. */
  const askRef = useRef<((row: FaqRow) => void) | null>(null);
  const eachGroup = useMemo(
    () => (notice?.action?.kind === "asGroup" ? rowOf(questionsOf(plan, askProps, true), EACH_GROUP) : null),
    [notice, plan, askProps],
  );
  /* Its target lights on the HUD while it is said, and while the line is hovered or focused. */
  const [noticeLit, setNoticeLit] = useState(false);
  /* What the answer (or a citation hovered in the chat) lights on the HUD and on the hub's chips. */
  const hud = useMemo(
    () => litOf(now.answer, now.cite ?? (noticeLit && notice ? notice.target : null), plan, hasPlace),
    [now.answer, now.cite, noticeLit, notice, plan, hasPlace],
  );
  const lit = hud.ids;
  const showAll = now.all || hud.all;
  /* A row opened from outside: an answer about it, or "Show every check" (every rule read opens, a miss shows its failing check). */
  const opens = (node: string) => hud.open.has(node) || (showAll && landed);

  // --- Words for the pieces ---
  const via = deciderVia(plan);
  /* The state under a name (two lines at most, jarvis.css): the lock is the first that covers, so "first" goes unsaid. */
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

  // --- The policies' labels: measured once per plan, by offsets ---
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [labelH, setLabelH] = useState<number[]>([]);
  /* The room each label's state needs, fixed for the plan: the words it will END on (and "In view ·" before them
     when it is pressed) set against what one line holds (about 20 characters at 12px in the label's 129px). A
     label that needs a second line reserves it from the start, so no label grows under the eye as the run plays. */
  const stateRoom = plan.policies.map((p) => {
    const end: PolState = p.decides ? "locked" : alsoIds.has(p.policyId) ? "also" : p.scanned ? "passed" : "quiet";
    return `In view · ${statusOf(p, end)}`.length > STATE_LINE_CHARS ? 2 : 1;
  });
  const sig = `${plan.policies.map((p) => p.name).join("|")}#${stateRoom.join("")}`;
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
    /* Each label as near its segment's projected edge at rest as the column allows (the hub's tilt: jarvis1-tilt.ts). */
    const P = reduced ? FLAT : projector(TILT, 0);
    const nat = segs.map((g) => {
      const e = polar(g.mid, R + SEG_W, 0, 0);
      return CY + P(e.x, e.y, 10).y;
    });
    const hs = plan.policies.map((_, i) => labelH[i] ?? 52);
    /* 20 apart: the lock's reticle stands 4px proud of its label and the next one needs air below it; never up into the conditions. */
    return stack(nat, hs, 20, TOP - 4);
  }, [segs, plan.policies, labelH, reduced]);
  const labelMid = labelTops.map((t, i) => t + (labelH[i] ?? 52) / 2);

  // --- The world's size, from the plan: never grows under the eye while it plays ---
  const panelMax = useMemo(() => panelHeightMax(plan), [plan]);
  const landing = landingOf(plan);
  const allExtra =
    showAll && landing
      ? landing.checks.reduce(
          (h, c) => h + (c.subs.length > 1 ? c.subs.length * 22 : 0),
          0,
        )
      : 0;
  /* The panel as drawn now: an answer may open a folded row or every check, after landing. */
  const panelNow = useMemo(() => {
    if (plan.rules.length === 0) return 0;
    const rows = plan.rules.reduce(
      (h, r) => h + rowHeight(rowLook(r, s, showAll, opens(r.node))),
      0,
    );
    return PANEL_HEAD + rows + ROW_GAP * (plan.rules.length - 1) + PANEL_PAD;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- opens reads showAll and hud.open
  }, [plan.rules, s, showAll, hud.open]);
  /* The verdict's own height, plus its Break-in line once the attempts are in. */
  const vH =
    verdictHeight(plan, notice !== null, notice?.action != null) +
    (eachGroup ? 34 : 0) +
    (breakIn ? 34 : 0);
  const seeH = now.see ? 300 : 0;
  /* Narrow (jarvis1-geometry.ts, the narrow world): the canvas decides, measured on the stage's ground. */
  const [stacked, setStacked] = useState(false);
  const stackedRef = useRef(stacked);
  stackedRef.current = stacked;
  const ringRowH = Math.max(
    RING_BOTTOM + 6 + NAMEPLATE_H,
    ...labelTops.map((t, i) => t + (labelH[i] ?? 52)),
  );
  /* The policy in view (pressed on the ring): its rules as titles, under a line saying what the run did with it. */
  const viewH = viewPol
    ? PANEL_HEAD + 26 + viewPol.lines.length * (QUIET_H + ROW_GAP) + PANEL_PAD
    : 0;
  const panelTall = Math.max(panelMax, panelNow, viewH) + allExtra;
  /* Where the rules and the verdict stand: beside the ring (wide), or under it, one column (stacked). */
  const geo = stacked
    ? {
        panelX: 0,
        panelY: ringRowH + STACK_GAP,
        panelW: STACK_COL,
        verdictX: 0,
        verdictY: ringRowH + STACK_GAP + panelTall + STACK_GAP,
        verdictW: STACK_COL,
        worldW: STACK_W,
      }
    : {
        panelX: PANEL_X,
        panelY: TOP,
        panelW: PANEL_W,
        verdictX: VERDICT_X,
        verdictY: TOP,
        verdictW: VERDICT_W,
        worldW: WORLD_W,
      };
  const worldH = Math.ceil(
    Math.max(
      ringRowH,
      geo.panelY + panelTall,
      geo.verdictY + vH + (seeH ? seeH + 14 : 0),
    ) + 6,
  );

  // --- The camera ---
  /* Framing a settled run: wide, the whole world (never past the words' size); stacked, the words keep their
     size and the answer is framed — the ring and the rules are a pan up (the wheel, a drag). */
  /* Editing (the panel open, the run settled): the camera frames the hub — the thing being edited — not the verdict. */
  const editingNow = useRef(false);
  editingNow.current = props.editing === true && !running;
  const frame = useCallback((jump: boolean) => {
    const v = stage.current;
    if (!v) return;
    if (!stackedRef.current) {
      v.fit({ max: 1, jump });
      return;
    }
    /* Stacked, the column is too tall to read whole: it takes the room's width (never past 1), and the verdict is
       what the camera frames — in the editing state too, when the Configure panel has narrowed the stage. */
    const ground = worldRef.current?.closest<HTMLElement>(".rstage");
    const w = worldRef.current;
    let z = 1;
    if (ground && w) {
      const natural = w.getBoundingClientRect().width / (v.zoom() || 1);
      if (natural > 0) z = Math.min(1, Math.floor(((ground.clientWidth - 32) / natural) * 100) / 100);
    }
    v.fit({ min: z, max: z, jump: true });
    v.follow(verdictRef.current, { lazy: false, jump });
  }, []);
  /* The canvas's width decides wide or stacked, before the first paint and on every resize (the panel opening). */
  useLayoutEffect(() => {
    const ground = worldRef.current?.closest<HTMLElement>(".rstage");
    if (ground) setStacked(stackedAt(ground.clientWidth));
  }, []);
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
      frame(true);
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
    frame(reduced || jumped || !animate);
  }, [landed, runKey, reduced, jumped, animate, frame]);
  const settledNow = useRef(!running);
  settledNow.current = !running;
  useEffect(() => {
    const ground = worldRef.current?.closest(".rstage");
    if (!ground || typeof ResizeObserver === "undefined") return;
    let lastSize = "";
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (size === lastSize) return;
      const firstTime = lastSize === "";
      lastSize = size;
      /* Wide or stacked: a change re-lays the world, and the effect below frames it once it has. */
      const narrow = stackedAt(r.width);
      setStacked(narrow);
      if (firstTime || !settledNow.current || narrow !== stackedRef.current) return;
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => frameRef.current(true));
    });
    ro.observe(ground);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, []);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  /* The panel opening or closing on a settled run: the hub (editing) or the answer comes back into frame. */
  const wasEditing = useRef(editingNow.current);
  useEffect(() => {
    const e = props.editing === true && !running;
    if (wasEditing.current === e) return;
    wasEditing.current = e;
    if (running || !stackedRef.current) return;
    const id = window.requestAnimationFrame(() => frameRef.current(reduced));
    return () => window.cancelAnimationFrame(id);
  }, [props.editing, running, reduced]);
  /* Wide ↔ stacked (the panel opened or closed): frame the new world — settled, as a settled run; playing, at the
     words' size on the piece at work (the follow below catches the next beat). */
  const laidOut = useRef(stacked);
  useLayoutEffect(() => {
    if (laidOut.current === stacked) return;
    laidOut.current = stacked;
    const v = stage.current;
    if (!v) return;
    if (settledNow.current) frame(true);
    else {
      v.fit({ min: 1, max: 1, jump: true });
      v.follow(landed ? verdictRef.current : panelOpen ? panelRef.current : coreRef.current, { lazy: false, jump: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only as the world changes shape
  }, [stacked]);

  /* Her chat (jarvis1-ask.tsx, in the dock's `.ad` frame) is the room's floor: the world fits above it.
     With the chat open, the floor rises to the chat's top — never a zoom out (the HUD stays at its size): the camera
     only pans, so the piece an answer lights comes up above the chat. Folded, the HUD comes back to the middle. */
  const [chatOpen, setChatOpen] = useState(false);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    const el = rootRef.current?.querySelector<HTMLElement>(".ad");
    if (!el) return;
    const read = () =>
      setDockH((h) =>
        Math.abs(h - el.offsetHeight) < 4 ? h : el.offsetHeight,
      );
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* What the ask bar and the Leave pill take off the stage's floor, measured: in a narrow stage the pill sits
     above the bar rather than beside it, so the room under the world is the higher of the two, and 12 px of air. */
  const [clearH, setClearH] = useState(0);
  useEffect(() => {
    const ground = rootRef.current?.closest<HTMLElement>(".rstage") ?? worldRef.current?.closest<HTMLElement>(".rstage");
    if (!ground) return;
    const read = () => {
      const g = ground.getBoundingClientRect();
      let top = g.bottom;
      const els = [
        rootRef.current?.querySelector<HTMLElement>(".jv1-ask"),
        ground.closest(".sit")?.querySelector<HTMLElement>(".sit-ae"),
      ];
      for (const el of els) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.bottom > g.top && r.top < g.bottom) top = Math.min(top, r.top);
      }
      const next = Math.ceil(g.bottom - top + 12);
      setClearH((h) => (Math.abs(h - next) < 2 ? h : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(ground);
    for (const el of [rootRef.current?.querySelector(".jv1-ask"), ground.closest(".sit")?.querySelector(".sit-ae")]) if (el) ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);
  const padBottom = Math.max(
    ARUNA_ASK_PAD,
    clearH,
    chatOpen ? dockH + 24 : 0,
  );
  /* The floor moved (the pill went above the bar, the chat grew): a settled world is framed again, by its own rule. */
  useEffect(() => {
    if (!settledNow.current || chatOpen) return;
    const id = window.requestAnimationFrame(() => frameRef.current(true));
    return () => window.cancelAnimationFrame(id);
  }, [padBottom, chatOpen]);
  /* After landing, the world grew (every check, a row opened, What they see): frame it again.
     What they see opened, the camera stays at the words' size and goes to the card — it is the thing to read. */
  const framed = useRef({ worldH, see: now.see });
  useEffect(() => {
    const f = framed.current;
    if (f.worldH === worldH && f.see === now.see) return;
    framed.current = { worldH, see: now.see };
    /* With the chat open the camera only pans (below); it frames the HUD again as the chat folds. */
    if (!landed || (chatOpen && !now.see)) return;
    const id = window.requestAnimationFrame(() => {
      const v = stage.current;
      if (!v) return;
      if (now.see && seeRef.current) {
        if (Math.abs(v.zoom() - 1) > 0.01)
          v.fit({ min: 1, max: 1, jump: true });
        v.follow(seeRef.current, { lazy: true, jump: reduced });
      } else frame(reduced);
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the world or What they see change after landing
  }, [worldH, now.see]);
  /* An answer: the piece it is most about comes into view above the chat (a pan, never a zoom). Folded: the HUD back in the middle. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!landed) return;
    const id = window.requestAnimationFrame(() => {
      const v = stage.current;
      const w = worldRef.current;
      if (!v || !w) return;
      const lit =
        w.querySelector(".rl-jarvis__check.is-lit") ??
        w.querySelector(".rl-jarvis__rule.is-lit") ??
        w.querySelector(".rl-jarvis__verdict.is-lit") ??
        w.querySelector(".rl-jarvis__plabel.is-lit");
      if (!chatOpen) {
        const was = wasOpen.current;
        wasOpen.current = false;
        /* Stacked, an answer's piece may be a pan away even with the chat folded: it comes into view. */
        if (stackedRef.current && lit) v.follow(lit, { lazy: true, jump: reduced });
        else if (was) frame(reduced);
        return;
      }
      wasOpen.current = true;
      if (now.see && seeRef.current) return;
      if (lit) v.follow(lit, { lazy: true, jump: reduced });
      /* Stacked, nothing lit: the answer's head stays above the chat. */
      else if (stackedRef.current) v.follow(verdictRef.current, { lazy: true, y: 0, jump: reduced });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on each answer, and as the chat opens, grows or folds
  }, [now.seq, chatOpen, padBottom]);

  // --- The voice: Jarvis's timbre through the shared narrator (one mute for Focus, Brief and Jarvis: idp.check-voice) ---
  const narrator = useNarrator({
    runKey,
    running,
    jumped,
    reduced,
    persona: JARVIS_PERSONA,
  });
  const narratorRef = useRef(narrator);
  useLayoutEffect(() => {
    narratorRef.current = narrator;
  });
  /* A beat: waits for the line being said (never a queue — a newer beat replaces the one waiting). */
  const speak = useCallback((line: string, gesture = false) => {
    if (!line) return;
    void narratorRef.current.say(line, { wait: true, gesture });
  }, []);

  // --- The companion: its presence, its greeting, what it noticed, what it remembers ---
  /* The dock's ears and thought (listening to a question, reading one), for the presence. */
  const [ears, setEars] = useState<"listening" | "thinking" | null>(null);
  /* The heard words stay in the field a moment before the ask is read: it keeps listening through that
     hold, so the presence never drops to idle between "Listening" and "Reading your question". */
  const earsNow = useRef<"listening" | "thinking" | null>(null);
  const earsOff = useRef(0);
  const hear = useCallback((p: "listening" | "thinking" | null) => {
    window.clearTimeout(earsOff.current);
    const was = earsNow.current;
    earsNow.current = p;
    if (p === null && was === "listening") {
      earsOff.current = window.setTimeout(() => setEars(null), 450);
      return;
    }
    setEars(p);
  }, []);
  useEffect(() => () => window.clearTimeout(earsOff.current), []);
  /* An act it was told to do ("Running", "Opening"): from the answer to the act, then until the run starts or the page goes. */
  const [act, setAct] = useState<string | null>(null);
  const actOff = useRef(0);
  /* A run it was told to start: its line ("Running as Finance only.") opens that run's first beat (a new run stops the voice). */
  const runLine = useRef<string | null>(null);
  const acting = useCallback((a: Action) => {
    const run = isRunAction(a);
    runLine.current = run ? didLine(a) : null;
    setAct(run ? "Running" : "Opening");
    window.clearTimeout(actOff.current);
    /* A run clears it as it starts; a press that stays on the page (the panel, the inset), a moment after. */
    actOff.current = window.setTimeout(() => {
      setAct(null);
      runLine.current = null;
    }, run ? 2400 : a.kind === "openRule" || a.kind === "openPolicy" ? 2600 : 900);
  }, []);
  useEffect(() => () => window.clearTimeout(actOff.current), []);
  useEffect(() => {
    if (running) setAct(null);
  }, [running, runKey]);
  /* Once a session, as the HUD comes up (after the entrance; never over a run playing): it names itself
     and says what it is for, aloud and under its name. */
  const [greeting, setGreeting] = useState<string | null>(null);
  const greetFor = useRef({ empty: plan.empty, running });
  greetFor.current = { empty: plan.empty, running };
  useEffect(() => {
    if (greeted()) return;
    const at = bootIn !== null ? bootIn + 760 : 420;
    let off = 0;
    const on = window.setTimeout(() => {
      if (greeted() || greetFor.current.running) return;
      markGreeted();
      const line = greetFor.current.empty
        ? `I'm ${COPILOT_NAME}. Run a sign-in and I'll walk you through it.`
        : `I'm ${COPILOT_NAME}. Ask me why, or what would change it.`;
      setGreeting(line);
      const hide = () => setGreeting((g) => (g === line ? null : g));
      /* On show for the length of the line (about 6 s when muted), then it fades. A say that returns at
         once was never said (muted, no voice): the 6 s stand. */
      const t0 = performance.now();
      void narratorRef.current
        .say(line, { wait: true, gesture: true })
        .then(() => {
          if (performance.now() - t0 < 900) return;
          window.clearTimeout(off);
          off = window.setTimeout(hide, 1200);
        });
      off = window.setTimeout(hide, Math.max(6000, estMs(line) + 2600));
    }, at);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the HUD comes up
  }, []);
  /* A run starting puts the greeting away at once. */
  useEffect(() => {
    if (running) setGreeting(null);
  }, [running]);
  /* The state, one word (COMPANION §1): listening > acting > thinking > working > speaking > greeting > idle. */
  const saying = narrator.speaking;
  const presence: Presence =
    ears === "listening"
      ? "listening"
      : act
        ? "acting"
        : ears === "thinking"
          ? "thinking"
          : running && !landed
            ? "working"
            : greeting && (!saying || saying === greeting)
              ? "greeting"
              : saying
                ? "speaking"
                : "idle";

  /* A notice press goes through the dock's own press: it acts, and the thread says what it did. */
  const dockPress = useRef<((a: Action) => void) | null>(null);
  const pressNotice = (a: Action) => {
    if (dockPress.current) {
      dockPress.current(a);
      return;
    }
    acting(a);
    if (!onAction(a)) runAction(a, askLite);
  };

  /* Memory, this visit only (leaving or reloading forgets it): each run's number and what it got. */
  const o0 = plan.outcome;
  const word0 =
    o0.status === "decided" && o0.decision
      ? DECISION_WORDS[o0.decision]
      : o0.status === "depends"
        ? "Depends"
        : "No policy decides";
  const runs = useRef<{ key: number; app: string; word: string | null }[]>([]);
  if (!plan.empty && !runs.current.some((h) => h.key === runKey)) runs.current.push({ key: runKey, app: plan.appName, word: null });
  const runNo = runs.current.findIndex((h) => h.key === runKey) + 1;
  useEffect(() => {
    const h = runs.current.find((x) => x.key === runKey);
    /* Once: a new sign-in's plan can arrive a frame before its run key does. */
    if (h && h.word === null && landed && !plan.empty) h.word = word0;
  }, [landed, plan.empty, runKey, word0]);
  /* The thread's divider and, landed, its receipt: "Allow with 2FA. Run 1 was Allow on 1 factor." (only when it differs). */
  const prior = [...runs.current]
    .slice(0, Math.max(0, runNo - 1))
    .reverse()
    .find((h) => h.app === plan.appName && h.word !== null);
  const runNote = {
    divider: `Run ${runNo} · ${personName} → ${plan.appName}`,
    receipt: landed && !plan.empty ? `${word0}.${prior && prior.word !== word0 ? ` Run ${runs.current.indexOf(prior) + 1} was ${prior.word}.` : ""}` : null,
  };

  /* Said when the verdict's line ends (the run has landed by then). */
  const noticeRef = useRef(notice);
  useLayoutEffect(() => {
    noticeRef.current = notice;
  });
  const sayThenNotice = useCallback(
    (line: string, gesture = false) => {
      if (!line) return;
      const key = runKey;
      void narratorRef.current
        .say(line, { wait: true, gesture })
        .then(() => {
          const next = noticeRef.current;
          if (next && said.current?.run === key && !said.current.beats.has("notice")) {
            said.current.beats.add("notice");
            setNoticeLit(true);
            void narratorRef.current
              .say(noticeLine(next.text), { wait: true, gesture })
              .finally(() => setNoticeLit(false));
          }
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `said` is a ref, read late
    [runKey],
  );

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
      running ||
      (reduced && !jumped && !plan.empty && !SEEN.has(seenKey) && !jarvisJustEntered());
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
    if (b.run !== runKey) said.current = { run: runKey, beats: new Set() };
    const beats = said.current.beats;
    if (plan.empty) return;
    /* The first run it narrates this session opens with its name (the greeting, folded into the run). */
    const hello = (line: string | null) => {
      if (!line) return line;
      /* A run it was told to start says so first: "Running as Finance only. …" */
      const told = runLine.current;
      runLine.current = null;
      const said = told ? `${told} ${line}` : line;
      if (greeted()) return said;
      markGreeted();
      return `I'm ${COPILOT_NAME}. ${said}`;
    };
    const once = (k: string, line: string | null, gesture = false) => {
      if (beats.has(k)) return;
      beats.add(k);
      if (line) speak(line, gesture);
    };
    /* The answer's line, then what the copilot noticed. */
    const closing = (k: string, line: string | null, gesture = false) => {
      if (beats.has(k)) return;
      beats.add(k);
      if (line) sayThenNotice(line, gesture);
    };
    if (jumped) {
      /* Skip: nothing more is said. */
      ["start", "lock", "rules", "verdict", "all", "notice"].forEach((k) => beats.add(k));
      return;
    }
    if (!running && !beats.has("start") && !beats.has("all")) {
      /* Landed without playing (reduced motion), fresh from the Run press: one line. */
      ["start", "lock", "rules", "verdict"].forEach((k) => beats.add(k));
      closing("all", hello(lineAll(askCtx)), true);
      return;
    }
    if (!running) return;
    if (reduced || (last && !beats.has("start"))) {
      ["start", "lock", "rules", "verdict"].forEach((k) => beats.add(k));
      /* (Guarded: `hello` spends the act's line, so it is asked only for a line that will be said.) */
      if (!beats.has("all")) closing("all", hello(lineAll(askCtx)));
      return;
    }
    if (!beats.has("start")) once("start", hello(lineStart(askCtx)));
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
      const busy = narratorRef.current.speaking !== null;
      if (!busy && full && estMs(full) <= left + 900) speak(full);
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
      closing(
        "verdict",
        beats.has("rules-folded")
          ? `${fold} ${lineVerdict(askCtx)}`.trim()
          : lineVerdict(askCtx),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock and the run move the beats
  }, [s, runKey, running, jumped]);

  // --- The dock's answers: what each lights on the HUD, and the two presses that are the HUD's own ---
  const onAnswer = useCallback(
    (a: Answer | null) => {
      /* Words that command an act: the acting state from the answer to the act (the dock's 350 ms). */
      if (a?.acts && a.actions[0]) acting(a.actions[0]);
      setUi((u) => {
        const base = u.run === runKey ? u : freshUi(runKey);
        if (!a) return { ...base, answer: null, cite: null };
        /* One answer at a time: another question puts What they see away, so the camera frames the HUD it lights. */
        return {
          ...base,
          answer: a,
          seq: base.seq + 1,
          cite: null,
          peek: null,
          see: a.kind === "see" ? true : a.kind === "checks" ? base.see : false,
        };
      });
    },
    [runKey, acting],
  );
  const onCite = useCallback(
    (t: Target | null) =>
      setUi((u) => ({ ...(u.run === runKey ? u : freshUi(runKey)), cite: t })),
    [runKey],
  );
  /* "Show what Maya sees" opens the inset; "Show every check" opens every check. The rest the dock does. */
  const onAction = useCallback(
    (a: Action): boolean => {
      acting(a);
      /* A way out of the page says its line first ("Opening rule 2 in the builder."), then goes. */
      if (a.kind === "openRule" || a.kind === "openPolicy") {
        const wait = narratorRef.current.muted ? 700 : Math.min(2400, estMs(didLine(a)));
        window.setTimeout(() => runAction(a, askLite), wait);
        return true;
      }
      if (a.kind !== "see" && a.kind !== "checks") return false;
      setUi((u) => {
        const base = u.run === runKey ? u : freshUi(runKey);
        return a.kind === "see"
          ? { ...base, see: true, peek: null }
          : { ...base, all: true, peek: null };
      });
      return true;
    },
    [runKey, acting, askLite],
  );

  /* The nameplate steps aside where the dock leaves it no room (1280×800 with the panel open, the chat up):
     the mark in the ask field and the live region still say the state. Read by offsets, a few times a second. */
  const [plateHidden, setPlateHidden] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const check = () => {
      const plate = root.querySelector<HTMLElement>(".jv1-np");
      const dock = root.querySelector<HTMLElement>(".ad__panel");
      if (!plate || !dock) return;
      const p = plate.getBoundingClientRect();
      const d = dock.getBoundingClientRect();
      const crowded = p.right > d.left && p.left < d.right && p.bottom + 4 > d.top;
      setPlateHidden((h) => (h === crowded ? h : crowded));
    };
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, []);
  /* Esc stops the voice at once (in a filled ask field it clears the words first: the dock's). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !narratorRef.current.speaking) return;
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement && t.classList.contains("ad__input") && t.value) return;
      narratorRef.current.cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // --- The inspector ---
  const onPeek = useCallback(
    (id: string, el: HTMLElement | null, pin: boolean) => {
      const world = worldRef.current;
      if (!world || !el) return;
      const b = boxIn(el, world);
      if (!b) return;
      const W = 280;
      /* Stacked: under what it is about, inside the column (there is no room beside it). */
      if (stackedRef.current) {
        const peek = { id, pin, x: Math.max(0, Math.min(STACK_W - W, b.x + b.w - W)), y: b.y + b.h + 8, side: "right" as const };
        setUi((u) => {
          if (pin && u.peek?.id === id && u.peek.pin) return { ...u, peek: null };
          if (!pin && u.peek?.pin) return u;
          return { ...u, peek };
        });
        return;
      }
      /* A rule's detail opens to its left, over the policy list, so it never covers the verdict. */
      const side: Peek["side"] =
        id.startsWith("rule:") && b.x - 12 - W >= 0
          ? "left"
          : b.x + b.w + 12 + W <= WORLD_W + 40
            ? "right"
            : "left";
      const x = side === "right" ? b.x + b.w + 12 : b.x - 12 - W;
      const y = Math.max(0, b.y);
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
      if (t?.closest(".ad")) return;
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

  const uid = useId().replace(/:/g, "");
  /* The ring's keys: arrows go round in engine order, Home/End, Enter or Space puts one in view, Esc back. */
  const onRingKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const n = plan.policies.length;
    if (n === 0) return;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        next = (activeRing - 1 + n) % n;
        break;
      case "ArrowRight":
      case "ArrowDown":
        next = (activeRing + 1) % n;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setRingFocus(true);
        lockAt(activeRing);
        return;
      case "Escape":
        if (now.inView !== null) {
          e.preventDefault();
          e.stopPropagation();
          setUi((u) => ({ ...u, inView: null }));
          if (deciderIdx >= 0) setRingAt(deciderIdx);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    setRingFocus(true);
    setRingAt(next);
  };

  /* The tooltip's words: what this policy did in this run, then what a press does. */
  const tipOf = (i: number): { line: string; tone: string; hint: string } => {
    const p = plan.policies[i];
    const st = states[i];
    if (!p) return { line: "", tone: "", hint: "" };
    const cover = plan.conflicts?.policies.find((x) => x.policyId === p.policyId);
    const press = landed && !running ? (viewIdx === i || (viewIdx === null && i === deciderIdx) ? "Its rules are in view" : "Press: show its rules") : "";
    switch (st) {
      case "locked":
        return landed
          ? { line: p.isGlobalDefault ? `No policy above covers ${first} · decides` : `Covers ${first} · decides`, tone: tone === "notice" ? "is-notice" : tone === "negative" ? "is-negative" : "is-positive", hint: press }
          : { line: `Covers ${first} · checking its rules`, tone: "is-work", hint: "" };
      case "found":
        return { line: `Covers ${first}`, tone: "is-work", hint: "" };
      case "scan":
        return { line: "Checking now", tone: "is-work", hint: "" };
      case "also":
        return {
          line: `Also covers ${first}${cover?.via.say ? `, ${cover.via.say}` : ""}. Not used: policy ${decider?.order ?? 1} came first.`,
          tone: "is-notice",
          hint: press,
        };
      case "passed":
        return { line: `Passed: not for ${first}`, tone: "", hint: press };
      case "quiet":
        return {
          line: decider ? `Not reached: the engine stopped at policy ${decider.order}` : p.reason || "Not reached",
          tone: "",
          hint: press,
        };
      default:
        return { line: "Waiting to be asked", tone: "", hint: "" };
    }
  };
  /* The policy in view, when it is not the one that decides: what the run did with it. */
  const viewNote = (() => {
    if (!viewPol || viewIdx === null) return "";
    const st = states[viewIdx];
    const cover = plan.conflicts?.policies.find((x) => x.policyId === viewPol.policyId);
    if (st === "also")
      return `Also covers ${first}${cover?.via.say ? ` ${cover.via.say}` : ""}. Not used: policy ${decider?.order ?? 1} decided.`;
    if (st === "passed") return `Passed in this run: not for ${first}.`;
    return decider ? `Not reached in this run: policy ${decider.order} decided first.` : "Not reached in this run.";
  })();

  const peekBody = (id: string): ReactNode => {
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
    let y = geo.panelY + PANEL_HEAD;
    for (let i = 0; i < plan.landing; i++)
      y +=
        rowHeight(
          rowLook(plan.rules[i], s, showAll, opens(plan.rules[i].node)),
        ) + ROW_GAP;
    return y;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- opens reads showAll and hud.open
  }, [landing, plan.landing, plan.rules, s, showAll, hud.open, geo.panelY]);
  const wireTone = landed ? `is-${tone}` : "is-drawn";
  const showOut = deciding || landed;

  /* Settled and motion allowed: the core and the verdict's edge breathe. */
  const breathe = landed && !reduced;
  /* An answer's route pulse and reticle play again for each answer that asks for them (never under reduced motion). */
  const replay = !reduced && now.answer !== null;
  const wireKey = hud.wire ? `a${now.seq}` : "run";
  const wirePlay = play || (hud.wire && replay);
  const holes = breakIn?.summary.holes ?? 0;

  return (
    <div
      ref={rootRef}
      className={`rl-jarvis-root${landed ? ` is-landed is-tone-${tone}` : " is-running"}${booting ? " is-booting" : ""}${props.unrun ? " is-unrun" : ""}`}
      data-stage={look}
      data-jv-presence={presence}
      style={
        bootIn !== null
          ? ({ "--jv-boot-delay": `${bootIn}ms` } as CSSProperties)
          : undefined
      }
    >
      {/* The stage: warm near-black (or paper), its grid, a vignette — the room the HUD stands in. */}
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
        externalDock
        pad={{ top: 64, left: 16, right: 16, bottom: padBottom }}
        label={`Sign-in run: ${plan.appName}`}
        overlay={
          <>
            {/* The sign-in, said above the canvas — the same row Focus and Brief draw, in her own look.

                For one day her circle said it instead: the person at its core, the application at the gate, the
                conditions orbiting as chips. The owner reversed that ("revert the circle, and give me the old top bar
                as we have in Focus"), and with the circle back to being the engine's, this canvas would otherwise be
                the only one that never says whose sign-in it is drawing.

                `look="jarvis"` is not a new skin: sign-in-row.css has carried her ember palette for this row since it
                was built, and the component's own header names her as one of its three. */}
            <SignInRow
              run={props}
              look={dark ? "jarvis" : "light"}
              lit={hud.rowLit}
              previewing={now.answer?.previewing ?? null}
            />
            {/* Her floor: the questions this run can answer, asked by a press (no field to type in), her answers in
                her own thread, and her voice. No zoom: her world fits itself (jarvis1-ask.tsx). */}
            <ArunaAsk
              run={props}
              ready={ready}
              groups={groups}
              askProps={askProps}
              narrator={narrator}
              theme={dark ? "jarvis" : "jarvis-light"}
              lead={<CopilotMark state={presence} />}
              runNote={runNote}
              onAnswer={onAnswer}
              onCite={onCite}
              onAction={onAction}
              onOpenChange={setChatOpen}
              onThinking={(t) => hear(t ? "thinking" : null)}
              pressRef={dockPress}
              askRef={askRef}
              /* No stage button on the bar: the Mode button at the top switches Aruna light and dark (4 Oct 2026). */
              trailing={
                STAGE_FROM_TOP ? undefined : <DockButton
                  label="Dark stage"
                  tip={dark ? "Light stage" : "Dark stage"}
                  pressed={dark}
                  onClick={() => setLook(dark ? "light" : "dark")}
                >
                  {dark ? (
                    <Sun size={14} strokeWidth={2} aria-hidden />
                  ) : (
                    <Moon size={14} strokeWidth={2} aria-hidden />
                  )}
                </DockButton>
              }
            />
          </>
        }
      >
        <div
          key={runKey}
          ref={worldRef}
          className="rl-jarvis__world"
          style={{ width: geo.worldW, height: worldH } as CSSProperties}
          data-jv-shape={stacked ? "stacked" : "wide"}
        >
          {/* Where the camera follows while the engine works on the ring (and while the sign-in is edited). */}
          <div
            ref={coreRef}
            className="rl-jarvis__slot"
            style={{
              left: 0,
              top: 0,
              width: LABEL_X + LABEL_W,
              height: RING_BOTTOM + 6 + NAMEPLATE_H,
            }}
            aria-hidden
          />

          {/* The circle: the engine's core, her presence round it, and the application's policies on the band
              (jarvis1-hub.tsx). It asks for nothing about the sign-in — the run line above the canvas says that. */}
          <JarvisHub
            policies={plan.policies}
            states={states}
            segs={segs}
            labelMid={labelMid}
            lit={lit}
            play={play}
            idle={idle}
            landed={landed}
            reduced={reduced}
            tone={tone}
            sweepTo={sweepTo}
            sweepMs={dur}
            bootMs={stepMs(plan, 0)}
            breathe={breathe}
            presence={presence}
            hover={ringHover}
            inView={viewIdx}
            onHover={onHubHover}
            onLock={lockAt}
          />
          {/* The companion: her name and state under the hub. */}
          <Nameplate
            state={presence}
            top={RING_BOTTOM + 6}
            greeting={greeting}
            act={act}
            hidden={plateHidden}
            animate={!reduced}
          />

          {/* The policies' labels, beside their segments: the ring's one tab stop (a listbox; arrows go round in engine
              order, Enter or Space puts one in view, Esc back to the one that decides). A label and its segment are one target. */}
          <div
            className="rl-jarvis__plist"
            role="listbox"
            tabIndex={plan.policies.length > 0 ? 0 : -1}
            aria-label={`Policies of ${plan.appName || "the application"}, in order`}
            aria-activedescendant={ringFocus && plan.policies.length > 0 ? `${uid}-pol-${activeRing}` : undefined}
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) setRingFocus(true);
            }}
            onBlur={() => setRingFocus(false)}
            onKeyDown={onRingKey}
          >
          {plan.policies.map((p, i) => {
            const st = states[i];
            const said = statusOf(p, st);
            const inView = viewIdx === i;
            const words = inView ? `In view${said ? ` · ${said}` : ""}` : said;
            const conflict = st === "also" && conflictIds.has(p.policyId);
            const toned = landed && st === "locked" ? ` is-${tone}` : "";
            const isLit = lit.has(p.node);
            const shown = viewIdx ?? deciderIdx;
            return (
              <div
                key={p.policyId}
                id={`${uid}-pol-${i}`}
                role="option"
                aria-selected={shown === i}
                aria-label={`${p.order} · ${p.name}${said ? `, ${said}` : ""}`}
                aria-describedby={tipAt === i ? `${uid}-tip` : undefined}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                className={`rl-jarvis__plabel is-${st}${toned}${conflict ? " is-conflict" : ""}${isLit ? " is-lit" : ""}${hover === i ? " is-hover" : ""}${ringFocus && activeRing === i ? " is-focus" : ""}${inView ? " is-inview" : ""}`}
                style={{
                  left: LABEL_X,
                  top: labelTops[i] ?? TOP,
                  width: LABEL_W,
                }}
                data-card
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => {
                  setRingAt(i);
                  lockAt(i);
                }}
              >
                <motion.div
                  initial={play ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: play ? 0.3 : 0,
                    delay: play ? 0.22 + i * 0.07 : 0,
                  }}
                >
                  <div
                    className="rl-jarvis__pbtn"
                    data-node={p.node}
                    data-jv={p.node}
                    aria-hidden
                  >
                    <span className="rl-jarvis__pname">
                      <span className="rl-jarvis__pnum">{p.order}</span>
                      <span className="rl-jarvis__ptext" title={p.name}>
                        {p.name}
                      </span>
                    </span>
                    <motion.span
                      className="rl-jarvis__pstate"
                      style={stateRoom[i] === 2 ? { minHeight: 34 } : undefined}
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
                      {st === "also" && (
                        <TriangleAlert className="rl-jarvis__pwarn" size={12} strokeWidth={2.4} aria-hidden />
                      )}
                      {inView && (
                        <span className="rl-jarvis__pinview">
                          {said ? "In view ·" : "In view"}
                        </span>
                      )}
                      {said ? (
                        <Decode
                          text={said}
                          play={play && st !== "quiet"}
                          ms={340}
                        />
                      ) : inView ? null : (
                        " "
                      )}
                    </motion.span>
                  </div>
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
                  <Reticle
                    key={hud.relock === p.node ? `a${now.seq}` : "run"}
                    play={play || (hud.relock === p.node && replay)}
                    gap={4}
                  />
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
          </div>
          {/* The tooltip: under the label, inside the label column (never over the rules). */}
          {tipAt !== null && plan.policies[tipAt] && (
            <PolicyTip
              id={`${uid}-tip`}
              name={plan.policies[tipAt].name}
              {...tipOf(tipAt)}
              left={LABEL_X - 8}
              top={(labelTops[tipAt] ?? TOP) + (labelH[tipAt] ?? 52) + 6}
            />
          )}

          {/* The analysis panel: the locked policy, opened. */}
          <div
            ref={panelRef}
            className={`rl-jarvis__panelslot`}
            style={{
              left: geo.panelX,
              top: geo.panelY,
              width: geo.panelW,
              minHeight: panelMax,
            }}
            aria-hidden={!panelOpen || undefined}
          >
            {viewPol && (
              <section
                className="rl-jarvis__panel has-open"
                data-node="inview"
                aria-label={`Rules in ${viewPol.name}`}
              >
                <header
                  className="rl-jarvis__panelhead"
                  style={{ height: PANEL_HEAD - 8 }}
                >
                  <span className="rl-jarvis__kicker">Rules in</span>
                  <span className="rl-jarvis__paneltitle" title={viewPol.name}>
                    {viewPol.name}
                  </span>
                  <button
                    type="button"
                    className="rl-jarvis__openpol"
                    onClick={() => onOpenPolicy(viewPol.policyId)}
                  >
                    Open policy
                    <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                  </button>
                </header>
                <p
                  className={`rl-jarvis__inviewnote${viewIdx !== null && states[viewIdx] === "also" ? " is-notice" : ""}`}
                >
                  {viewIdx !== null && states[viewIdx] === "also" && (
                    <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
                  )}
                  {viewNote}
                </p>
                <div
                  className="rl-jarvis__rows"
                  style={{ gap: ROW_GAP, paddingBottom: PANEL_PAD }}
                >
                  {viewPol.lines.map((l) => (
                    <div
                      key={l.id}
                      className={`rl-jarvis__rule ${l.enabled ? "is-quiet" : "is-off"}`}
                      style={{ height: QUIET_H }}
                    >
                      <div
                        className="rl-jarvis__rulehead"
                        style={{ height: QUIET_H, cursor: "default" }}
                      >
                        <span className="rl-jarvis__num">
                          {l.index === null ? (
                            <Lock size={11} strokeWidth={2.2} aria-hidden />
                          ) : (
                            l.index + 1
                          )}
                        </span>
                        <span className="rl-jarvis__rulename" title={l.name}>
                          {l.index === null ? "Nothing else matched" : l.name}
                        </span>
                        {!l.enabled && (
                          <span className="rl-jarvis__kicker">Switched off</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!viewPol && !panelOpen && (
              <Frame
                label={
                  decider ? "Rules" : landed ? "No policy decides" : "Rules"
                }
                dim
                play={play}
              />
            )}
            {!viewPol && panelOpen && decider && (
              <motion.section
                className={`rl-jarvis__panel${landed ? " has-open" : ""}`}
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
                  {landed && (
                    <button
                      type="button"
                      className="rl-jarvis__openpol"
                      onClick={() => onOpenPolicy(decider.policyId)}
                    >
                      Open policy
                      <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                    </button>
                  )}
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
                      all={showAll}
                      lit={lit.has(r.node)}
                      litChecks={hud.checks}
                      opened={opens(r.node)}
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
              left: geo.verdictX,
              top: geo.verdictY,
              width: geo.verdictW,
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
                  {/* What the copilot noticed: one line, in its tone, with its one press (only Run runs). */}
                  {notice && (
                    <motion.div
                      className={`rl-jarvis__finding is-${notice.tone}`}
                      variants={fade(play)}
                      onPointerEnter={() => setNoticeLit(true)}
                      onPointerLeave={() => setNoticeLit(false)}
                      onFocus={() => setNoticeLit(true)}
                      onBlur={() => setNoticeLit(false)}
                    >
                      <p className="rl-jarvis__ntext">
                        <span className="rl-jarvis__noticed">
                          {notice.tone === "notice" && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
                          Noticed
                        </span>
                        {notice.text}
                      </p>
                      {notice.action && (
                        <div className="rl-jarvis__npresses">
                          <button
                            type="button"
                            className="rl-jarvis__npress"
                            onClick={() => notice.action && pressNotice(notice.action)}
                          >
                            {isRunAction(notice.action) ? (
                              <Play size={12} strokeWidth={2.4} aria-hidden />
                            ) : notice.action.kind === "add" ? (
                              <Plus size={12} strokeWidth={2.4} aria-hidden />
                            ) : (
                              <ArrowUpRight size={12} strokeWidth={2.4} aria-hidden />
                            )}
                            {notice.action.label}
                          </button>
                          {/* Beside the per-group run: the question itself, answered in her chat (nothing runs). */}
                          {eachGroup && (
                            <button
                              type="button"
                              className="rl-jarvis__npress"
                              disabled={!ready}
                              onClick={() => askRef.current?.(eachGroup)}
                            >
                              <MessageCircleQuestion size={12} strokeWidth={2.4} aria-hidden />
                              {eachGroup.label}
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                  {screens.length > 0 && form.appId && (
                    <motion.div
                      className="rl-jarvis__vfoot"
                      variants={fade(play)}
                    >
                      {(
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
                  {/* The application's break-in attempts, once they are in: the page's attempts panel. */}
                  {breakIn && onReviewBreakIn && (
                    <motion.button
                      type="button"
                      className={`rl-jarvis__breakin${holes > 0 ? " is-holes" : ""}`}
                      variants={fade(play)}
                      onClick={() => onReviewBreakIn("outcome")}
                    >
                      <ShieldAlert size={14} strokeWidth={2} aria-hidden />
                      <span>Break-in attempts</span>
                      <ChevronRight size={14} strokeWidth={2} aria-hidden />
                    </motion.button>
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
            className={`rl-jarvis__wires${viewPol ? " is-dim" : ""}`}
            width={geo.worldW}
            height={worldH}
            aria-hidden
          >
            {panelOpen && deciderLabelMid !== null && (
              <Wire
                key={`in:${wireKey}`}
                d={
                  stacked
                    ? bracket(STACK_COL + 2, deciderLabelMid, geo.panelY + PANEL_HEAD / 2 - 4)
                    : elbow(
                        LABEL_X + LABEL_W + 2,
                        deciderLabelMid,
                        PANEL_X - 2,
                        TOP + PANEL_HEAD / 2 - 4,
                      )
                }
                cls={landed ? wireTone : "is-working"}
                play={wirePlay}
                flow={idle}
                ms={play ? Math.max(260, stepMs(plan, at.expand) * 0.6) : 420}
              />
            )}
            {showOut && landingTop !== null && (
              <Wire
                key={`out:${wireKey}`}
                d={
                  stacked
                    ? bracket(STACK_COL + 2, landingTop + HEAD_H / 2, geo.verdictY + 46)
                    : elbow(
                        PANEL_X + PANEL_W + 2,
                        landingTop + HEAD_H / 2,
                        VERDICT_X - 2,
                        TOP + 46,
                      )
                }
                cls={landed ? wireTone : "is-working"}
                play={wirePlay}
                flow={idle}
                ms={
                  play
                    ? Math.max(260, stepMs(plan, Math.max(0, at.outcome - 1)))
                    : 520
                }
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

/* The tooltip under a policy's label: its name, what it did in this run, what a press does. */
function PolicyTip({
  id,
  name,
  line,
  tone,
  hint,
  left,
  top,
}: {
  id: string;
  name: string;
  line: string;
  tone: string;
  hint: string;
  left: number;
  top: number;
}) {
  return (
    <div id={id} role="tooltip" className="rl-jarvis__ptip" style={{ left, top }}>
      <b>{name}</b>
      <span className={tone}>{line}</span>
      {hint && <span className="rl-jarvis__ptiphint">{hint}</span>}
    </div>
  );
}
