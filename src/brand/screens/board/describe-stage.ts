import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import type { AnswerKey } from '../../create/describe-model'

/* -----------------------------------------------------------------------------
   Describe it, played out (owner, 19 Oct 2026: "an AI type of experience, not
   exactly AI … add some real-time delay so it can be looked at … the canvas
   should react … show that we are cooking in real time").

   The reader answers at once; this module stages that answer so it can be
   watched. A message goes through four beats:

     1. Reading   — the bubble's words light up one after another.
     2. Steps     — one line per answer the reader found, each a spinner that
                    turns into a tick with what it found (Rox's checklist, with
                    its running count).
     3. Canvas    — the board is written now, not before: the cards arrive
                    while the last line says the canvas is being updated.
     4. Done      — the list folds into one "Understood" line that opens again
                    (Gumloop's collapsed steps), and the rows, the change line
                    and Undo come in under it.

   The board's write is HELD from beat 1 to beat 3 (BoardBuilder `holdDescribe`)
   so the canvas really changes when the panel says it does. Stop, Escape or
   closing the panel finishes at once; reduced motion skips the staging.

   Off (`DESCRIBE_STAGED`) = the reply arrives whole, as before. The pieces it draws are DescribeStage.tsx.
   -------------------------------------------------------------------------- */

export const DESCRIBE_STAGED = true

/* Where Describe it is offered (owner, 19 Oct 2026: "remove Describe from here or hide it as of now … add it into the
   policy builder part"): not as a card on the empty policy's chooser, but inside the builder — one permanent bar on
   the canvas, which takes the selected card as its context (DescribeMagic.tsx). A balloon beside "Add the first rule"
   was tried the same day and dropped ("this is terrible"), and a button in every card gave way to the bar's context
   ("so we don't have to add two buttons"). */
export const DESCRIBE_CARD = false
export const DESCRIBE_BAR = true

/* Guided setup (owner, 19 Oct 2026; docs/specs/GUIDED-SETUP.md): Describe it renamed, and rebuilt on picks and forms
   only — a panel on the left (or the right, or beside the rule panel) with the latest change said in plain lines, a
   muted history, and one docked next step: the New rule form, or the selected rule's quick actions. It works on any
   App Access policy that is not the system policy, draft or live; each action is one ordinary board edit, unsaved
   until Save policy. Off = today's Describe it panel, door and words (GuidedSetup.tsx, guided-setup.ts). */
export const GUIDED_SETUP = true

/* The beats' lengths, in ms. Long enough to read a line, short enough not to wait on. */
export const STAGE_MS = {
  /** Reading: a base, and a little per character, capped. */
  readBase: 750,
  readPerChar: 14,
  readMax: 1600,
  /** Each answer's line. */
  step: 560,
  /** The canvas line: the cards' own entrance plays inside it. */
  canvas: 900,
  /** A pick (Guided setup): no reading beat, a quicker line, a shorter canvas beat. */
  picked: 280,
  pickedCanvas: 700,
} as const

export const readMs = (text: string) => Math.min(STAGE_MS.readMax, STAGE_MS.readBase + text.trim().length * STAGE_MS.readPerChar)

/* What each answer's line says while it works. Done, it says the row's own label and what was found. */
export const WORKING: Record<AnswerKey, string> = {
  apps: 'Finding the applications',
  who: 'Finding the people and groups',
  leaveOut: 'Finding who to leave out',
  where: 'Matching zones and hours',
  devices: 'Matching device profiles',
  signIn: 'Choosing what happens',
  fallback: 'Choosing what happens to everyone else',
}

export interface StepLine {
  key: AnswerKey
  /** The row's label: Applications, Who, Then … */
  label: string
  /** What was found, as words. */
  found: string
}

export type Stage =
  | { phase: 'read'; text: string; before: number }
  | { phase: 'await'; before: number }
  | { phase: 'steps'; turnId: number; step: number }

/* The staging, as a hook. `send` starts it; the panel draws from `stage`. */
export function useDescribeStage({
  latestId,
  stepsOf,
  onSend,
  onCommit,
}: {
  latestId: number
  /** How many answer lines a turn has. */
  stepsOf: (turnId: number) => number
  onSend: (message: string, hold?: boolean) => void
  onCommit?: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const [stage, setStage] = useState<Stage | null>(null)
  /* The turn that has just finished playing: its rows and change line come in, once. */
  const [arrived, setArrived] = useState<number | null>(null)
  const latest = useRef(latestId)
  latest.current = latestId
  const props = useRef({ onSend, onCommit, stepsOf })
  props.current = { onSend, onCommit, stepsOf }
  /* The stage as last drawn, for Finish now and for leaving mid-play. */
  const live = useRef(stage)
  live.current = stage

  const send = useCallback(
    (text: string) => {
      if (!DESCRIBE_STAGED || reduced || !props.current.onCommit) {
        props.current.onSend(text)
        return
      }
      setArrived(null)
      setStage({ phase: 'read', text, before: latest.current })
    },
    [reduced],
  )

  /* Finish now: whatever beat it is in, the answer lands whole. The stage is read from the ref and the board's
     callbacks run here, in the event — never inside a `setStage` updater, where they updated the builder while React
     rendered the panel ("Cannot update a component while rendering a different component", Esc mid-play, 19 Oct). */
  const finish = useCallback(() => {
    const fx = finishStage(live.current)
    if (!fx) return
    live.current = null
    setStage(null)
    if (fx.arrived !== null) setArrived(fx.arrived)
    if (fx.send !== null) props.current.onSend(fx.send)
    else if (fx.commit) props.current.onCommit?.()
  }, [])

  /* Beat 1 → the turn, held. */
  useEffect(() => {
    if (stage?.phase !== 'read') return
    const t = window.setTimeout(() => {
      props.current.onSend(stage.text, true)
      setStage({ phase: 'await', before: stage.before })
    }, readMs(stage.text))
    return () => window.clearTimeout(t)
  }, [stage])

  /* The turn arrived (a new id) → its steps. Nothing new (the reader had nothing to add) → done. */
  useEffect(() => {
    if (stage?.phase !== 'await') return
    if (latestId !== stage.before) {
      setStage({ phase: 'steps', turnId: latestId, step: 0 })
      return
    }
    const t = window.setTimeout(() => {
      props.current.onCommit?.()
      setStage(null)
    }, 120)
    return () => window.clearTimeout(t)
  }, [stage, latestId])

  /* Beats 2 and 3: one line at a time, then the canvas, then done. */
  useEffect(() => {
    if (stage?.phase !== 'steps') return
    const n = props.current.stepsOf(stage.turnId)
    if (stage.step < n) {
      const t = window.setTimeout(() => setStage({ ...stage, step: stage.step + 1 }), STAGE_MS.step)
      return () => window.clearTimeout(t)
    }
    /* The canvas line: the board is written as it starts. */
    props.current.onCommit?.()
    const t = window.setTimeout(() => {
      setArrived(stage.turnId)
      setStage(null)
    }, STAGE_MS.canvas)
    return () => window.clearTimeout(t)
  }, [stage])

  /* Leaving mid-play never loses the message or the board's write. */
  useEffect(
    () => () => {
      const st = live.current
      if (!st) return
      if (st.phase === 'read') props.current.onSend(st.text)
      else props.current.onCommit?.()
    },
    [],
  )

  return { stage, arrived, send, finish, busy: stage !== null }
}

/* What Finish now does in each beat, as a value — the hook acts on it in the event, outside any state updater:
   reading sends the message whole; waiting or stepping writes the held turn; a turn that was stepping has arrived.
   Null: nothing is playing. */
export function finishStage(st: Stage | null): { send: string | null; commit: boolean; arrived: number | null } | null {
  if (!st) return null
  if (st.phase === 'read') return { send: st.text, commit: false, arrived: null }
  return { send: null, commit: true, arrived: st.phase === 'steps' ? st.turnId : null }
}

/* --- Guided setup's play -------------------------------------------------------------------------------------------

   A pick plays at the picked tempo: no reading beat, a step line every `STAGE_MS.picked`, then the canvas beat — the
   board is written as it starts (`onCommit`), and the plain lines come in as it ends. Finish now (Stop, Esc, closing)
   lands it at once; reduced motion lands it at once and never steps. The board's write is called from an effect or an
   event, never from a state updater, and once per action. */
export interface GuidedPlayState {
  /** The action playing, by its log id. */
  id: number
  /** Step lines ticked so far: `steps` of them, then the canvas beat. */
  step: number
  steps: number
}

export function useGuidedPlay({ onCommit }: { onCommit: (id: number) => void }) {
  const reduced = useReducedMotion() ?? false
  const [play, setPlay] = useState<GuidedPlayState | null>(null)
  /* The action that has just finished playing: its lines come in, once. */
  const [arrived, setArrived] = useState<number | null>(null)
  const commitTo = useRef(onCommit)
  commitTo.current = onCommit
  const live = useRef(play)
  live.current = play
  /* The id last written, so a beat run twice (StrictMode) or a finish after the beat never writes it again. */
  const wrote = useRef<number | null>(null)
  const write = useRef((id: number) => {
    if (wrote.current === id) return
    wrote.current = id
    commitTo.current(id)
  })

  const start = useCallback(
    (id: number, steps: number) => {
      if (!DESCRIBE_STAGED || reduced) {
        write.current(id)
        setArrived(id)
        setPlay(null)
        return
      }
      setArrived(null)
      setPlay({ id, step: 0, steps })
    },
    [reduced],
  )

  useEffect(() => {
    if (!play) return
    if (play.step < play.steps) {
      const t = window.setTimeout(() => setPlay({ ...play, step: play.step + 1 }), STAGE_MS.picked)
      return () => window.clearTimeout(t)
    }
    /* The canvas beat: the board is written as it starts. */
    write.current(play.id)
    const t = window.setTimeout(() => {
      setArrived(play.id)
      setPlay(null)
    }, STAGE_MS.pickedCanvas)
    return () => window.clearTimeout(t)
  }, [play])

  /* Finish now. Whether there was anything to finish, so a key that asked for it can be taken only then. */
  const finish = useCallback((): boolean => {
    const p = live.current
    if (!p) return false
    live.current = null
    setPlay(null)
    setArrived(p.id)
    write.current(p.id)
    return true
  }, [])

  /* Closing mid-play never loses the write. */
  useEffect(
    () => () => {
      const p = live.current
      if (p) write.current(p.id)
    },
    [],
  )

  return { play, arrived, start, finish, busy: play !== null }
}

