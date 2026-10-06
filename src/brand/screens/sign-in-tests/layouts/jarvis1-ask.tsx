import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageCircleQuestion,
  Pencil,
  Play,
  Plus,
  ShieldAlert,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, animate as animateEl, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  didLine,
  iconOf,
  isRunAction,
  runAction,
  type Action,
  type Answer,
  type AskProps,
  type SuggestionIcon,
  type Target,
} from "./assistant/intents";
import type { Narrator } from "./assistant/voice";
import type { FaqGroup, FaqRow } from "./focus2-faq";
import { JarvisAnswer } from "./jarvis1-answer";
import {
  ASK_EMPTY,
  ASK_PLAYING,
  answerOf,
  nextQuestion,
  readLine,
} from "./jarvis1-ask-model";
import { COPILOT_NAME } from "../jarvis-mode/copilot-name";
import type { RunLayoutProps } from "./types";
/* The dock's sheet first — her palette (`--ad-*` under `.ad[data-stage='jarvis']`), the panel's glass, the answer's
   citations and the voice line all live there — and only the dock imported it, so a fresh load of this lazy layout
   would otherwise draw a bare sentence. Her own rules come after it, so they are the later ones. */
import "./assistant/assistant.css";
import "./jarvis1-ask.css";

/* -----------------------------------------------------------------------------
   ARUNA'S CHAT (JarvisLayout.tsx renders it; its questions are jarvis1-ask-model.ts).

   WHAT WAS WRONG. Her floor was the shared AssistantDock, and it brought
   three things she must not have:
   · a FREE TEXT FIELD, "Ask Aruna about this sign-in…", that promised a
     companion who understands anything typed — and the dock draws it
     unconditionally, so no prop could take it away (the dock is Brief's and
     Focus v1's too, and not ours to edit);
   · the stage's ZOOM, − 100% + and Fit, drawn whenever the dock is handed the
     stage. The owner had them removed from Focus as of no use (4 Oct 2026),
     and her world fits itself;
   · the Voice button's tooltip, which opens upward from row 2 and lands on
     row 1: "Voice off · turn it on" covered the mic, the send button and the
     chevron, and the left of the Leave pill beside the dock (measured at
     1440×900, the tooltip's box l979–1117 t804–839).
   So Aruna stops rendering the dock and has this instead, the way Focus v2
   built its own panel.

   WHY THIS IS RIGHT. It is still HER chat, at the dock's place and in the
   dock's look (the root keeps `.ad` and `data-stage`, so her ember palette,
   the glass, the travelling glow on the bar and the Leave pill's placement
   all carry over unchanged). The thread is hers as it was: the visit's
   (a divider per run and a receipt as it lands), each answer in her own card
   (jarvis1-answer.tsx) whose citations light the HUD as they are hovered,
   each answer's presses under it. What changed is where a question comes
   from: not a field, but the questions THIS run can answer (`faqOf`, the
   set Focus offers), as prompts at the foot of the thread — grouped as an
   admin thinks, the ones already asked kept and marked, never removed.
   The bar offers the next one, folded or open once there is an answer (the
   questions themselves sit under the answers, a scroll away), so a question
   is always one press away; before the run lands it says plainly that
   questions come then.

   NO TOOLTIPS on the bar: Stop, Questions and Voice carry their words, so
   nothing opens over anything. The mic went with the field — a spoken
   question is a typed one said aloud, and it reached the same keyword
   reader. Her VOICE stays: every answer is said as it lands, the run's
   beats are said as they play, and the line being said is the bar's while
   it is said, with Stop beside it.
   -------------------------------------------------------------------------- */

type Item =
  | {
      key: number;
      kind: "answer";
      answer: Answer;
      ready: boolean;
      run: number;
      read: string;
      from: { left: number; top: number } | null;
    }
  | { key: number; kind: "did" | "divider" | "receipt"; text: string };

/* The dock's own pacing, kept so she feels the same: a beat of reading before the answer, then a commanded act. */
const THINK_MS = 700;
const ACT_MS = 350;

/* A3: the question bubble flies in from the pill that asked it. The pill stays in the list (marked), so this is a
   measured shared-element move — Motion's imperative animate on a plain element, never a CSS transform on a
   motion.* one — rather than a layoutId, which would take the pill with it. */
function Question({
  text,
  from,
  play,
}: {
  text: string;
  from: { left: number; top: number } | null;
  play: boolean;
}) {
  const el = useRef<HTMLParagraphElement | null>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !from || !play) return;
    const r = node.getBoundingClientRect();
    const dx = Math.max(-240, Math.min(240, from.left - r.left));
    const dy = Math.max(-320, Math.min(320, from.top - r.top));
    const c = animateEl(
      node,
      { x: [dx, 0], y: [dy, 0], opacity: [0.35, 1] },
      { duration: 0.35, ease: [0.2, 0, 0, 1] },
    );
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <p ref={el} className="ad__q">
      {text}
    </p>
  );
}

const ICON: Record<SuggestionIcon, typeof Play> = {
  question: MessageCircleQuestion,
  run: Play,
  open: ArrowUpRight,
  add: Plus,
  breakIn: ShieldAlert,
  show: Eye,
  edit: Pencil,
};

export interface ArunaAskProps {
  /** The props the layout was handed: the plan, where the run is, the ways out. */
  run: RunLayoutProps;
  /** The run has landed and settled: questions may be asked (the dock's own gate). */
  ready: boolean;
  /** `questionsOf(plan, askProps, ready)`: the layout's one call, which item 3's verdict press also reads. */
  groups: readonly FaqGroup[];
  /** The words' props, with the previews (what-if.ts) once landed, so "What would change the answer?" can be offered. */
  askProps: AskProps;
  narrator: Narrator;
  theme: "jarvis" | "jarvis-light";
  /** The bar's leading mark: her presence at its smallest (jarvis1-presence.tsx CopilotMark). */
  lead: ReactNode;
  /** This run's divider ("Run 2 · Maya Iyer → AWS Console") and, once landed, its receipt. */
  runNote: { divider: string; receipt: string | null };
  /** Before Voice on the bar (the stage's light / dark switch, when the page's Mode button does not hold it). */
  trailing?: ReactNode;
  /** The answer on show (null: folded, or a new run): the layout lights the HUD with it. */
  onAnswer: (a: Answer | null) => void;
  /** A citation hovered or focused in the thread (null when left). */
  onCite: (t: Target | null) => void;
  /** Every press, first: true when the layout did it; otherwise the words' own `runAction` does. */
  onAction: (a: Action) => boolean;
  onOpenChange: (open: boolean) => void;
  /** Reading a question (the beat before its answer), for her presence. */
  onThinking: (thinking: boolean) => void;
  /** Filled with the chat's press, for one drawn elsewhere (the verdict's Noticed line): it acts and the thread says so. */
  pressRef: MutableRefObject<((a: Action) => void) | null>;
  /** Filled with the chat's ask, for a question drawn elsewhere (the verdict's "What does each group get?"). */
  askRef: MutableRefObject<((row: FaqRow) => void) | null>;
}

export function ArunaAsk({
  run,
  ready,
  groups,
  askProps,
  narrator,
  theme,
  lead,
  runNote,
  trailing,
  onAnswer,
  onCite,
  onAction,
  onOpenChange,
  onThinking,
  pressRef,
  askRef,
}: ArunaAskProps) {
  const { plan, runKey, reduced } = run;
  const motionOk = !reduced;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpenState] = useState(false);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  /* The callbacks and the run, read late: the layout's inline arrows re-run nothing here. */
  const cb = useRef({
    onAnswer,
    onCite,
    onAction,
    onOpenChange,
    askProps,
    plan,
    narrator,
    runNote,
    ready,
  });
  useLayoutEffect(() => {
    cb.current = {
      onAnswer,
      onCite,
      onAction,
      onOpenChange,
      askProps,
      plan,
      narrator,
      runNote,
      ready,
    };
  });

  const setOpen = useCallback((o: boolean) => {
    setOpenState((was) => {
      if (was !== o) window.setTimeout(() => cb.current.onOpenChange(o), 0);
      return o;
    });
  }, []);

  /* The canvas's size: the thread scrolls inside 40% of its height (the dock's own rule, `--ad-room`). */
  const [room, setRoom] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return;
    const measure = () =>
      setRoom({ w: host.clientWidth || 1200, h: host.clientHeight || 800 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /* A new run: the thread is the visit's, so it stays — a divider names the new run, the asked marks start again
     (they were about the last run's answers), and the chat folds so the run plays in the open. */
  const lastKey = useRef(runKey);
  useEffect(() => {
    if (lastKey.current === runKey) return;
    lastKey.current = runKey;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const divider = cb.current.runNote.divider;
    setItems((xs) =>
      xs.length > 0
        ? [...xs, { key: ++seq.current, kind: "divider", text: divider }]
        : xs,
    );
    setAsked(new Set());
    setOpen(false);
    cb.current.onAnswer(null);
  }, [runKey, setOpen]);
  /* Once the new run lands, one receipt under its divider: its answer, and the last different one on this app. */
  const receiptFor = useRef<number | null>(null);
  useEffect(() => {
    const receipt = cb.current.runNote.receipt;
    if (!ready || !receipt || receiptFor.current === runKey) return;
    receiptFor.current = runKey;
    setItems((xs) =>
      xs.length > 0 && xs[xs.length - 1].kind === "divider"
        ? [...xs, { key: ++seq.current, kind: "receipt", text: receipt }]
        : xs,
    );
  }, [ready, runKey]);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  /* A press — an answer's button, or the verdict's Noticed line: the layout first, then the words' own; the thread
     says what it did, and she says it too unless it starts a run (a run's line opens that run's own beats). */
  const perform = useCallback((a: Action) => {
    const done = cb.current.onAction(a) || runAction(a, cb.current.askProps);
    if (!done) return;
    setItems((xs) => [
      ...xs,
      { key: ++seq.current, kind: "did", text: didLine(a) },
    ]);
    const n = cb.current.narrator;
    if (!n.muted && !isRunAction(a)) void n.say(didLine(a), { gesture: true });
  }, []);
  useLayoutEffect(() => {
    pressRef.current = perform;
    return () => {
      pressRef.current = null;
    };
  }, [pressRef, perform]);

  /* A question pressed: it goes into the thread, she reads it for a beat, and the answer lands — lit on the HUD by
     the layout, and said. Asked again, it is answered again: the mark stays, the question never goes. */
  const ask = useCallback(
    (row: FaqRow, source?: HTMLElement | null) => {
      if (!cb.current.ready) return;
      const a = answerOf(row, cb.current.plan, cb.current.askProps);
      if (!a) return;
      const key = ++seq.current;
      const box = source?.getBoundingClientRect();
      const from =
        box && box.width > 0 ? { left: box.left, top: box.top } : null;
      setItems((xs) => [
        ...xs,
        {
          key,
          kind: "answer",
          answer: a,
          ready: !motionOk,
          run: lastKey.current,
          read: readLine(cb.current.plan.summary),
          from,
        },
      ]);
      setAsked((was) => (was.has(row.id) ? was : new Set(was).add(row.id)));
      setOpen(true);
      const land = () => {
        setItems((xs) =>
          xs.map((x) =>
            x.key === key && x.kind === "answer" ? { ...x, ready: true } : x,
          ),
        );
        cb.current.onAnswer(a);
        const n = cb.current.narrator;
        if (!n.muted) void n.say(a.say, { gesture: true });
        const first = a.actions[0];
        if (a.acts && first)
          timers.current.push(window.setTimeout(() => perform(first), ACT_MS));
      };
      if (!motionOk) land();
      else timers.current.push(window.setTimeout(land, THINK_MS));
    },
    [motionOk, perform, setOpen],
  );
  useLayoutEffect(() => {
    askRef.current = ask;
    return () => {
      askRef.current = null;
    };
  }, [askRef, ask]);

  /* Newest at the foot, in view — and an answer taller than the thread opens at its top, not its end. */
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      const last = [...el.querySelectorAll<HTMLElement>(".ad__item")].pop();
      el.scrollTop = el.scrollHeight;
      if (!last || items[items.length - 1]?.kind !== "answer") return;
      const top =
        last.getBoundingClientRect().top - el.getBoundingClientRect().top;
      if (top < 0) el.scrollTop += top - 6;
    });
    return () => window.cancelAnimationFrame(id);
  }, [items, open]);

  const collapse = useCallback(() => {
    setOpen(false);
    cb.current.onAnswer(null);
  }, [setOpen]);

  /* A press on the canvas (not the chat) folds it, as the dock's did. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const host = root?.parentElement;
      const t = e.target as Node | null;
      if (!root || !host || !t || root.contains(t) || !host.contains(t)) return;
      collapse();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, collapse]);

  /* "/" anywhere on the page (not while typing) opens the chat on its first question — the dock's key, kept. */
  useEffect(() => {
    const firstQuestion = () =>
      rootRef.current?.querySelector<HTMLButtonElement>(
        ".jv1-ask__qs [data-q]",
      ) ?? null;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
        ) ||
          t.isContentEditable)
      )
        return;
      if (!rootRef.current?.isConnected || cb.current.plan.empty) return;
      e.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() =>
        firstQuestion()?.focus({ preventScroll: true }),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  /* In the chat: ↑ ↓ Home End move between the questions; Esc folds it and hands the keyboard back to the bar. */
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const onChatKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      collapse();
      toggleRef.current?.focus({ preventScroll: true });
      return;
    }
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    const list = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>(
        ".jv1-ask__qs [data-q]",
      ) ?? [],
    );
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? list.length - 1
          : e.key === "ArrowUp"
            ? Math.max(0, at - 1)
            : Math.min(list.length - 1, at + 1);
    list[to]?.focus();
  };

  const clearThread = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setItems([]);
    setAsked(new Set());
    cb.current.onAnswer(null);
  };

  const answers = items.filter(
    (i): i is Extract<Item, { kind: "answer" }> => i.kind === "answer",
  );
  const thinking = answers.some((i) => !i.ready);
  const thinkTo = useRef(onThinking);
  useLayoutEffect(() => {
    thinkTo.current = onThinking;
  });
  useEffect(() => thinkTo.current(thinking), [thinking]);
  /* An answer about an earlier run stays readable but inert: no presses, its citations dark. */
  const past = (it: Extract<Item, { kind: "answer" }>) => it.run !== runKey;
  const lastReady = [...answers].reverse().find((i) => i.ready && !past(i));
  const speaking = narrator.speaking;
  const next = ready ? nextQuestion(groups, asked) : null;
  const waitLine = plan.empty ? ASK_EMPTY : ASK_PLAYING;
  const citeTo = (t: Target | null) => cb.current.onCite(t);

  return (
    <div
      ref={rootRef}
      className={`ad jv1-ask${thinking || run.running ? " is-busy" : ""}${open ? " is-open" : ""}${reduced ? " is-reduced" : ""}`}
      data-stage={theme}
      data-card
      style={{
        ["--ad-room" as string]: `${room.h}px`,
        ["--ad-roomw" as string]: `${room.w}px`,
      }}
    >
      <div className="ad__panel" role="region" aria-label={COPILOT_NAME}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="thread"
              className="ad__threadwrap"
              initial={motionOk ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              exit={motionOk ? { height: 0, opacity: 0 } : undefined}
              transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
            >
              {items.length > 0 && (
                <div className="ad__threadhead">
                  <span>This session</span>
                  <button
                    type="button"
                    className="ad__clear"
                    onClick={clearThread}
                  >
                    Clear
                  </button>
                </div>
              )}
              <div
                ref={threadRef}
                id={threadId}
                className="ad__thread jv1-ask__thread"
                onKeyDown={onChatKey}
              >
                <div
                  className="jv1-ask__log"
                  role="log"
                  aria-live="polite"
                  aria-label="Answers"
                >
                  {items.map((it) =>
                    it.kind === "divider" ? (
                      <p key={it.key} className="ad__divider" role="separator">
                        <span>{it.text}</span>
                      </p>
                    ) : it.kind !== "answer" ? (
                      <p
                        key={it.key}
                        className={
                          it.kind === "receipt"
                            ? "ad__did ad__receipt"
                            : "ad__did"
                        }
                      >
                        {it.text}
                      </p>
                    ) : (
                      <div
                        key={it.key}
                        className={`ad__item${past(it) ? " is-past" : ""}`}
                      >
                        <Question
                          text={it.answer.ask}
                          from={it.from}
                          play={motionOk}
                        />
                        {!it.ready ? (
                          <p className="jv1-ask__read is-reading" role="status">
                            Reading the run…
                          </p>
                        ) : (
                          <>
                            <p className="jv1-ask__read">{it.read}</p>
                            <motion.div
                              className="jv1-ask__body"
                              initial={
                                motionOk && it === lastReady
                                  ? { opacity: 0, y: 6 }
                                  : false
                              }
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.3,
                                ease: [0.2, 0, 0, 1],
                              }}
                            >
                              <JarvisAnswer
                                a={it.answer}
                                animate={motionOk && it === lastReady}
                                onCite={past(it) ? () => {} : citeTo}
                              />
                              {it.answer.actions.length > 0 && !past(it) && (
                                <div className="ad__itemfoot">
                                  {it.answer.actions.map((a, i) => {
                                    const Icon = ICON[iconOf(a)];
                                    return (
                                      <button
                                        key={`${a.kind}:${a.label}`}
                                        type="button"
                                        className={`ad__action${i === 0 ? " is-primary" : ""}`}
                                        onClick={() => perform(a)}
                                      >
                                        <Icon
                                          size={13}
                                          strokeWidth={2.2}
                                          aria-hidden
                                        />
                                        {a.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>
                {/* The questions this run can answer, at the foot of the thread where the next one is asked. */}
                <div
                  className={`jv1-ask__qs${items.length > 0 ? " is-next" : ""}`}
                  role="group"
                  aria-label="Questions"
                >
                  {!ready ? (
                    <p className="jv1-ask__wait">{waitLine}</p>
                  ) : (
                    groups.map((g) => (
                      <section
                        key={g.key}
                        className="jv1-ask__grp"
                        aria-label={g.title}
                      >
                        <h3 className="jv1-ask__gtitle">{g.title}</h3>
                        <div className="jv1-ask__chips">
                          {g.rows.map((r) => {
                            const was = asked.has(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                data-q
                                className={`jv1-ask__q${was ? " is-asked" : ""}`}
                                onClick={(e) => ask(r, e.currentTarget)}
                              >
                                {was ? (
                                  <Check
                                    size={13}
                                    strokeWidth={2.4}
                                    aria-hidden
                                  />
                                ) : (
                                  <MessageCircleQuestion
                                    size={13}
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                )}
                                <span>{r.label}</span>
                                {was && (
                                  <span className="jv1-ask__sr">, asked</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The bar: her mark; the line she is saying (with Stop), or the next question, or why there is none yet;
            then Questions and Voice — words on every control, so no tooltip ever opens over another. */}
        <div
          className={`ad__ask jv1-ask__bar${speaking ? " is-speaking" : ""}`}
        >
          <div className="ad__field jv1-ask__field">
            {lead}
            {speaking ? (
              <div
                className="ad__voice jv1-ask__said"
                role="status"
                aria-live="off"
              >
                <span className="ad__wave" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={speaking}
                    className="ad__subtitle jv1-ask__line"
                    initial={
                      motionOk ? { opacity: 0, filter: "blur(5px)" } : false
                    }
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={
                      motionOk
                        ? {
                            opacity: 0,
                            filter: "blur(3px)",
                            transition: { duration: 0.12 },
                          }
                        : undefined
                    }
                    transition={{ duration: 0.3 }}
                  >
                    {speaking}
                  </motion.p>
                </AnimatePresence>
                <button
                  type="button"
                  className="jv1-ask__btn"
                  aria-label="Stop the voice"
                  onClick={() => narrator.cancel()}
                >
                  <Square
                    size={11}
                    strokeWidth={2.4}
                    fill="currentColor"
                    aria-hidden
                  />
                  Stop
                </button>
              </div>
            ) : next && (!open || items.length > 0) ? (
              <button
                type="button"
                className="jv1-ask__next"
                title={next.label}
                onClick={() => ask(next)}
              >
                <MessageCircleQuestion size={14} strokeWidth={2} aria-hidden />
                <span>{next.label}</span>
              </button>
            ) : open ? (
              <span className="jv1-ask__name">{COPILOT_NAME}</span>
            ) : (
              <span className="jv1-ask__wait">{ready ? "" : waitLine}</span>
            )}
            <span className="jv1-ask__space" />
            <button
              ref={toggleRef}
              type="button"
              className={`jv1-ask__btn${open ? " is-on" : ""}`}
              aria-expanded={open}
              aria-controls={open ? threadId : undefined}
              disabled={plan.empty && items.length === 0}
              onClick={() => (open ? collapse() : setOpen(true))}
            >
              {open ? (
                <ChevronDown size={14} strokeWidth={2} aria-hidden />
              ) : (
                <ChevronUp size={14} strokeWidth={2} aria-hidden />
              )}
              Questions
            </button>
            <span className="ad-sep" aria-hidden />
            {trailing}
            {/* Voice on / off: one key for every view (idp.check-voice), the word on the button and its state in
                the speaker and aria-pressed — the shared MuteToggle's tooltip is what covered the bar. */}
            <button
              type="button"
              className={`jv1-ask__btn${narrator.muted ? "" : " is-on"}`}
              aria-pressed={!narrator.muted}
              onClick={() => narrator.setMuted(!narrator.muted)}
            >
              {narrator.muted ? (
                <VolumeX size={14} strokeWidth={2} aria-hidden />
              ) : (
                <Volume2 size={14} strokeWidth={2} aria-hidden />
              )}
              Voice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
