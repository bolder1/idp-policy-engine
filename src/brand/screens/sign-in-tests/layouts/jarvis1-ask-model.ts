import type { EngineRun } from '../engine-run'
import { answer, type Answer, type AskProps, type ChipId } from './assistant/intents'
import { fixPossessive } from './focus-voice'
import { FAQ_WATCHING, faqOf, presentAnswer, shownSentence, watchingAnswer, type FaqAsk, type FaqGroup, type FaqRow } from './focus2-faq'

/* -----------------------------------------------------------------------------
   ARUNA'S QUESTIONS — the model under her own chat (jarvis1-ask.tsx draws it,
   JarvisLayout.tsx feeds it).

   WHAT WAS WRONG. Aruna's floor was the shared assistant dock, and row 1 of
   that dock is a free text field: "Ask Aruna about this sign-in…". Behind it
   is a fixed reader of the tenant's names and a keyword ladder that ends in
   an honest "I can answer about this sign-in:" — so the field advertised a
   companion that understands anything typed into it, in a security console
   where every answer is supposed to trace to the run. A prototype cannot keep
   that promise; it can answer one known set of questions, truthfully, from
   the run itself. Focus v2 already found that set (focus2-faq.ts) and the
   owner asked for one set in both views (4 Oct 2026: "swap the free-text ask
   for the questions she can actually answer").

   WHY THIS IS RIGHT. The list is `faqOf` itself, imported and never copied,
   so Focus and Aruna can never offer different questions about the same run,
   and its one safety rule comes with it: A QUESTION IS OFFERED ONLY WHEN ITS
   ANSWER EXISTS. An answer goes through `presentAnswer` (the corrected
   what-if list and the honest label on the checks press) and then the same
   two word fixes Focus's panel applies — `shownSentence` for the screen and
   `fixPossessive` for the voice — so she says what the screen shows, and
   what Focus says, word for word.

   NOTHING HERE IS FOCUS'S GEOMETRY. focus2-faq.ts also exports the Focus
   panel's widths and pads; Aruna's chat stands at the bottom centre of her
   stage, where the dock stood, so her one number (the floor she keeps under
   the world) is her own, below.

   PURE: no component, so oxlint keeps its baseline and jarvis1-ask.test.ts
   sweeps the rules over real runs without rendering anything.
   -------------------------------------------------------------------------- */

/* The room under the world for her folded chat: its one row (the 42 px bar inside 7 px of padding and a 1 px
   border each side = 58), 16 px off the floor, and 6 px of air. It replaces ASSISTANT_DOCK_PAD (112: the dock's 94,
   whose second row held the zoom and the Voice button), so the HUD gets 32 px of height back. */
export const ARUNA_ASK_PAD = 80

/** Said where the questions would be, before there is a run to ask about: the dock's own words, kept. */
export const ASK_EMPTY = 'Run a sign-in to ask about it.'
/* Said while the run is still being told. Offering a question about a picture the admin has not seen yet is
   offering an answer ahead of the evidence; the words are Focus v2's, so both views say the same thing. */
export const ASK_PLAYING = 'Questions come once the run lands.'

/** The questions this run can answer: `faqOf`'s groups once the run has landed, none before. Never throws. */
export function questionsOf(plan: EngineRun, props: AskProps, ready: boolean): FaqGroup[] {
  return ready ? faqOf(plan, props) : []
}

/** Every row, in the order the groups list them. */
export const rowsOf = (groups: readonly FaqGroup[]): FaqRow[] => groups.flatMap((g) => g.rows)

/** The row asking `ask`, or null when this run does not offer it — the gate item 3's press stands on. */
export function rowOf(groups: readonly FaqGroup[], ask: FaqAsk): FaqRow | null {
  return rowsOf(groups).find((r) => r.ask === ask) ?? null
}

/** "What does each group get?" — offered by `faqOf` only for a person in two or more groups whose probes resolved. */
export const EACH_GROUP: ChipId = 'ask:group'

/* The one question the folded bar offers: the first not yet asked, in the order an admin thinks. Null once every
   row is asked — the bar then says nothing in its place rather than repeat one. */
export function nextQuestion(groups: readonly FaqGroup[], asked: ReadonlySet<string>): FaqRow | null {
  return rowsOf(groups).find((r) => !asked.has(r.id)) ?? null
}

/**
 * A row's answer, as her chat draws and says it — or null for the one row that can have none (`faq:watching` when
 * nothing watches; `faqOf` never offers it then). Routed exactly as Focus v2 routes a press, so the two views answer
 * a question in the same words. Nothing runs: an answer only ever OFFERS a run, on a button whose label says Run.
 */
export function answerOf(row: Pick<FaqRow, 'ask' | 'label'>, plan: EngineRun, props: AskProps): Answer | null {
  const raw = row.ask === FAQ_WATCHING ? watchingAnswer(plan) : answer(row.ask, plan, props, row.label)
  if (!raw) return null
  const a = presentAnswer(raw, plan, props)
  return { ...a, sentence: shownSentence(a.sentence), say: fixPossessive(a.say) }
}

/** The reasoning line's summary: the engine's own count line ("Checked 2 policies · 1 rule · 4 checks", the one
    Focus's panel footer draws) said as what she read: "Read 2 policies · 1 rule · 4 checks". */
export function readLine(summary: string): string {
  return summary.replace(/^Checked/, 'Read')
}
