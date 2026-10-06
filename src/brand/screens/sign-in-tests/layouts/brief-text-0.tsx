import { Sentence } from './brief-sentence'
import { QUIET, type TextProps } from './brief-text'

/* Version 0 — TODAY'S SENTENCE, the baseline (brief-model.ts, brief-sentence.tsx):
   "Arun Patel gets into AWS Console on one factor: AWS for engineering teams
   applies through Engineering, and rule 2 matches because the Windows 11
   laptop meets Compliant devices." Written word by word as the engine
   proves each part; only change: the quiet underlines (brief-text.css). */
export function BriefText0({ brief, s, landed, animate, working, lit, pinned, tone, durOf, onHot, onPin }: TextProps) {
  return <Sentence className={QUIET} parts={brief.parts} num={brief.num} s={s} landed={landed} animate={animate} working={working} lit={lit} pinned={pinned} tone={tone} durOf={durOf} onHot={onHot} onPin={onPin} numbers={false} />
}
