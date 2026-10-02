import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Route } from "lucide-react";

import { DECISION_WORDS } from "../../../decision-words";
import { AppLogo } from "../../../logos/AppLogo";
import type { AccessDecision } from "../../../data";
import { FlightArc } from "./mission-arc";
import { SIDE_W, arcFor } from "./mission-geometry";
import type { Tone } from "./mission-intents";
import { met } from "./mission-model";
import { Decode } from "./mission-type";

/* -----------------------------------------------------------------------------
   The main display (MissionLayout.tsx): the launch pad at the left (who, their
   groups, the sign-in's facts), the orbit at the right (the application), the
   flight arc between them, and under its apex the mission clock while the poll
   runs — then the flight director's call, big: GO for sign-in and its factor
   sequence, a SCRUB and its message, or a HOLD and what it waits on.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const;

export interface PadFact {
  key: string;
  label: string;
  value: string;
  unset: boolean;
  mark: "fail" | "unknown" | null;
  needed: boolean;
}

export interface CallView {
  word: string;
  sub: string;
  tone: Tone;
  factors: string[];
  deny: string;
  ifs: { label: string; decision: AccessDecision }[];
}

export interface DisplayProps {
  width: number;
  /** At least DISPLAY_H; taller when the call has more to say (a hold's answers). */
  height: number;
  play: boolean;
  running: boolean;
  landed: boolean;
  tone: Tone;
  /** The mission-elapsed time the clock stands at for this step, and the next step's: it runs between them. */
  clock: { from: number; to: number; stepKey: number };
  flight: { to: number; ms: number };
  person: {
    name: string;
    groups: string;
    initials: string;
    working: boolean;
    lit: boolean;
  };
  app: { id: string | null; name: string; lit: boolean };
  facts: PadFact[];
  call: CallView;
  /** Who made the call: "Decided by" a rule, or the policy that applies while it waits on a fact. */
  by: { kick: string; policy: string; rule: string; open: (() => void) | null } | null;
  finding: {
    text: string;
    tone: "info" | "notice";
    onPress: () => void;
  } | null;
  extra: ReactNode;
  crew: { open: boolean; toggle: () => void } | null;
  routeLit: boolean;
  callLit: boolean;
  onPressPerson: () => void;
  onFact: (key: string, el: HTMLElement) => void;
  onRoute: () => void;
  empty: boolean;
}

/* The mission clock: it runs from this step's start toward the next, written straight into the span (no render per frame), and stops once the run lands. */
function Clock({
  from,
  to,
  run,
  stepKey,
}: {
  from: number;
  to: number;
  run: boolean;
  stepKey: number;
}) {
  const el = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    n.textContent = met(from);
    if (!run) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      n.textContent = met(Math.min(to, from + (now - t0)));
      if (from + (now - t0) < to) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [from, to, run, stepKey]);
  return (
    <span ref={el} className="rl-mission__clockval">
      {met(from)}
    </span>
  );
}

export function MainDisplay(p: DisplayProps) {
  const { width, height, play, landed, tone, call } = p;
  const a = arcFor(width);
  const callW = Math.min(680, width - 2 * (SIDE_W + 40));
  return (
    <section
      className={`rl-mission__display${landed ? ` is-landed is-${tone}` : " is-running"}`}
      style={{ width, height }}
      aria-label="Main display"
    >
      <motion.svg
        className="rl-mission__frame"
        width={width}
        height={height}
        aria-hidden
        initial={false}
      >
        <motion.rect
          x="0.5"
          y="0.5"
          width={width - 1}
          height={height - 1}
          rx="10"
          initial={play ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: play ? 0.6 : 0, ease: EASE }}
        />
      </motion.svg>
      <span className="rl-mission__dtag" aria-hidden>
        Main display
      </span>

      <FlightArc
        width={width}
        height={height}
        to={p.flight.to}
        ms={p.flight.ms}
        play={play}
        landed={landed}
        tone={tone}
        lit={p.routeLit}
      />
      {/* The arc is the route: pressed, it says the way the flight went. */}
      {!p.empty && (
        <button
          type="button"
          className={`rl-mission__routebtn${p.routeLit ? " is-on" : ""}`}
          data-card
          style={{ left: a.c.x - 70, top: 5 }}
          onClick={p.onRoute}
          aria-label="Show the route"
        >
          <Route size={12} strokeWidth={2} aria-hidden />
          The route
        </button>
      )}

      {/* The launch pad: who. */}
      <div className="rl-mission__pad" style={{ width: SIDE_W - 30 }}>
        <span className="rl-mission__kicker">Launch pad</span>
        <button
          type="button"
          className={`rl-mission__who${p.person.working ? " is-working" : ""}${p.person.lit ? " is-lit" : ""}`}
          data-node="sign-in"
          data-mx="sign-in"
          data-card
          onClick={p.onPressPerson}
          aria-label={`${p.person.name}${p.person.groups ? `, ${p.person.groups}` : ""}. Change the sign-in`}
        >
          <span className="rl-mission__face" aria-hidden>
            {p.person.initials}
          </span>
          <span className="rl-mission__whotext">
            <strong className="rl-mission__name" title={p.person.name}>
              {p.person.name}
            </strong>
            {p.person.groups && (
              <span className="rl-mission__groups">{p.person.groups}</span>
            )}
          </span>
        </button>
        <ul className="rl-mission__padfacts">
          {p.facts.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                className={`rl-mission__padfact${f.mark ? ` is-${f.mark}` : ""}${f.needed ? " is-needed" : ""}`}
                data-card
                data-mx={`fact:${f.key}`}
                onClick={(e) => p.onFact(f.key, e.currentTarget)}
                aria-label={`${f.label}: ${f.value}${f.needed ? ". Add it" : ". Details"}`}
              >
                <span className="rl-mission__pflabel">{f.label}</span>
                <span className="rl-mission__pfvalue" title={f.value}>
                  {f.value}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* The orbit: to what. */}
      <div
        className={`rl-mission__orbit${p.app.lit ? " is-lit" : ""}`}
        style={{
          left: a.p1.x + 22,
          width: width - a.p1.x - 40,
          top: a.p1.y - 19,
        }}
      >
        <span className="rl-mission__orbitlogo">
          {p.app.id && <AppLogo appId={p.app.id} name={p.app.name} size={20} />}
        </span>
        <span className="rl-mission__orbittext">
          <span className="rl-mission__kicker">Orbit</span>
          <strong className="rl-mission__appname" title={p.app.name}>
            {p.app.name}
          </strong>
        </span>
      </div>

      {/* Under the apex: the clock while the poll runs, then the call. */}
      <div
        className="rl-mission__callslot"
        style={{ left: (width - callW) / 2, width: callW }}
      >
        {!landed && (
          <div className="rl-mission__clock" aria-hidden>
            <span className="rl-mission__kicker">
              {p.empty ? "Standing by" : "Mission elapsed"}
            </span>
            <Clock
              from={p.clock.from}
              to={p.clock.to}
              run={p.running && play}
              stepKey={p.clock.stepKey}
            />
            <span className="rl-mission__clocknote">
              {p.empty ? "Choose a person and an application" : "Polling"}
            </span>
          </div>
        )}
        {landed && (
          <motion.div
            className={`rl-mission__verdict is-${call.tone}${p.callLit ? " is-lit" : ""}`}
            data-node="outcome"
            data-mx="outcome"
            data-card
            role="group"
            aria-label={`${call.word}${call.sub ? `, ${call.sub}` : ""}`}
            initial={play ? "out" : false}
            animate="in"
            variants={{
              out: {},
              in: {
                transition: play
                  ? { staggerChildren: 0.09, delayChildren: 0.12 }
                  : {},
              },
            }}
          >
            <motion.p className="rl-mission__callword" variants={fade(play)}>
              <Decode text={call.word} play={play} ms={420} delay={80} />
              {call.sub && (
                <span className="rl-mission__callsub">{call.sub}</span>
              )}
            </motion.p>
            {(call.factors.length > 0 || p.crew) && (
              <motion.div className="rl-mission__seqrow" variants={fade(play)}>
                {call.factors.length > 0 && (
                  <ol className="rl-mission__seq" aria-label="Asked for">
                    {call.factors.map((f, i) => (
                      <motion.li
                        key={`${f}:${i}`}
                        className="rl-mission__seqstep"
                        initial={play ? { opacity: 0.25 } : false}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: play ? 0.22 : 0,
                          delay: play ? 0.5 + i * 0.32 : 0,
                        }}
                      >
                        <span className="rl-mission__seqn">{i + 1}</span>
                        {f}
                      </motion.li>
                    ))}
                  </ol>
                )}
                {p.crew && (
                  <button
                    type="button"
                    className={`rl-mission__crewbtn${p.crew.open ? " is-open" : ""}`}
                    aria-expanded={p.crew.open}
                    onClick={p.crew.toggle}
                  >
                    Crew view
                  </button>
                )}
              </motion.div>
            )}
            {call.deny && (
              <motion.p
                className="rl-mission__deny"
                variants={fade(play)}
                title={call.deny}
              >
                “{call.deny}”
              </motion.p>
            )}
            {call.ifs.length > 0 && (
              <motion.ul className="rl-mission__ifs" variants={fade(play)}>
                {call.ifs.map((x) => (
                  <li key={`${x.label}:${x.decision}`}>
                    <span>{x.label}</span>
                    <span
                      className={`rl-mission__ifword is-${x.decision === "deny" ? "negative" : "positive"}`}
                    >
                      {DECISION_WORDS[x.decision]}
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
            {p.by && (
              <motion.div
                className="rl-mission__callfoot"
                variants={fade(play)}
              >
                {p.by && (
                  <button
                    type="button"
                    className="rl-mission__by"
                    onClick={p.by.open ?? undefined}
                    disabled={!p.by.open}
                    aria-label={`${p.by.kick} ${p.by.policy}${p.by.rule ? `, ${p.by.rule}` : ""}. Open in the builder`}
                  >
                    <span className="rl-mission__bykick">{p.by.kick}</span>
                    <span
                      className="rl-mission__bytext"
                      title={`${p.by.policy}${p.by.rule ? ` · ${p.by.rule}` : ""}`}
                    >
                      {p.by.policy}
                      {p.by.rule && (
                        <span className="rl-mission__byrule">
                          {" "}
                          · {p.by.rule}
                        </span>
                      )}
                    </span>
                    {p.by.open && (
                      <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                    )}
                  </button>
                )}
              </motion.div>
            )}
            {p.finding && (
              <motion.button
                type="button"
                className={`rl-mission__finding is-${p.finding.tone}`}
                variants={fade(play)}
                onClick={p.finding.onPress}
              >
                {p.finding.text}
              </motion.button>
            )}
            {p.extra}
          </motion.div>
        )}
      </div>
    </section>
  );
}

const fade = (play: boolean) => ({
  out: { opacity: 0 },
  in: { opacity: 1, transition: { duration: play ? 0.26 : 0, ease: EASE } },
});
