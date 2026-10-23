import { motion } from 'motion/react'
import { CornerDownRight, Layers } from 'lucide-react'

import { ONE_OUTSIDE_HERE, oneReasonWords, type OneLine, type OneWhy } from './classic2-one-model'

/* -----------------------------------------------------------------------------
   The two pieces the merged Policy card adds (phase.ts ONE_POLICY_CARD, 20 Oct
   2026), its words classic2-one-model.ts's; the card itself, its rows and its
   Why are classic2-chain.tsx's.

     OneReason   under the head, only when the Global Default decides: why the
                 application's own did not — "No sign-in policy on Salesforce",
                 "HRMS access from corporate offices · Inactive", "Outside AWS
                 access". In line with the title, an unseen tile holding its
                 column, as the Why under it does.
     OneFoot     at the foot of the rules, once the walk is over: the Global
                 Default under the application's own policy, and another policy
                 on the application where the data really has one.

   A policy's name is a press only where the page has somewhere to take it: the
   page's inspector on the page; in the builder, the policy being built, back to
   its canvas. Elsewhere it is words. A press in either never folds the card.
   -------------------------------------------------------------------------- */

/** Decelerating: what arrives (classic2-chain.tsx's). */
const EASE_OUT = [0.2, 0, 0, 1] as const

function Name({ id, name, open }: { id: string; name: string; open?: (policyId: string) => void }) {
  if (!open)
    return (
      <span className="rl-c2__pname" title={name}>
        {name}
      </span>
    )
  return (
    <button type="button" className="rl-c2__pname rl-c2__pnamebtn" title={`Open ${name}`} onClick={() => open(id)}>
      {name}
    </button>
  )
}

/* `notice` (Check access v3 in the builder, 20 Oct 2026): the person is outside the policy being built — said in the
   notice tone, since the canvas then shows another policy's cards than the one open. */
export function OneReason({ why, appName, open, notice = false }: { why: OneWhy; appName: string; open?: (policyId: string) => void; notice?: boolean }) {
  const words = oneReasonWords(why, appName)
  if (!words) return null
  return (
    <div className={`rl-c2__under rl-c2__onereason${notice ? ' is-notice' : ''}`} onClick={(e) => e.stopPropagation()}>
      <span className="bb__idx rl-c2__idx rl-c2__whyspace" aria-hidden />
      <span className="rl-c2__onewhy">
        <CornerDownRight size={12} strokeWidth={2.2} aria-hidden />
        <span className="rl-c2__onetext">
          {words.before}
          {words.name && why.policyId && <Name id={why.policyId} name={words.name} open={open} />}
          {words.after}
        </span>
      </span>
    </div>
  )
}

export function OneFoot({ also, gd, open, animate, motion: moving = false }: { also: OneLine | null; gd: OneLine | null; open?: (policyId: string) => void; animate: boolean; motion?: boolean }) {
  if (!also && !gd) return null
  const lines = (
    <>
      {also && (
        <p className={`rl-c2__oneline${also.conflict ? ' is-conflict' : ''}`}>
          <Layers size={12} strokeWidth={2.2} aria-hidden />
          <Name id={also.policyId} name={also.name} open={open} />
          <span className="rl-c2__onewords">· {also.words}</span>
        </p>
      )}
      {gd && (
        <p className="rl-c2__oneline">
          <CornerDownRight size={12} strokeWidth={2.2} aria-hidden />
          <span className="rl-c2__onelabel">{ONE_OUTSIDE_HERE},</span>
          <Name id={gd.policyId} name={gd.name} open={open} />
          <span className="rl-c2__onewords">· {gd.words}</span>
        </p>
      )}
    </>
  )
  /* The run's motion (phase.ts RUN_MOTION, 20 Oct 2026): the foot is drawn in as the walk ends — its dashed rule left to
     right, then its words — the card's last beat before it reads complete. Drawn settled, it is simply there. */
  if (animate && moving)
    return (
      <div className="rl-c2__onefoot is-drawing">
        <motion.span className="rl-c2__onerule" aria-hidden initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.24, delay: 0.12, ease: EASE_OUT }} />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.2, ease: EASE_OUT }}>
          {lines}
        </motion.div>
      </div>
    )
  return (
    <motion.div
      className="rl-c2__onefoot"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={animate ? { duration: 0.2, delay: 0.12, ease: EASE_OUT } : { duration: 0 }}
    >
      {lines}
    </motion.div>
  )
}

/* CHECK ACCESS V3 (20 Oct 2026): a foot line said on the policy's head instead, as its one ↳ line — the Global Default
   under the application's own policy once the walk is over (`gd`: "Outside this policy, Global Default Policy · Not
   reached"), or another policy on the application. In the reason's own shape, so the head is one grammar whichever it
   says; it fades in as the walk ends. */
export function OneHeadLine({ line, open, animate, gd = false }: { line: OneLine; open?: (policyId: string) => void; animate: boolean; gd?: boolean }) {
  return (
    <motion.div
      className={`rl-c2__under rl-c2__onereason${line.conflict ? ' is-conflict' : ''}`}
      onClick={(e) => e.stopPropagation()}
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={animate ? { duration: 0.16, delay: 0.12, ease: EASE_OUT } : { duration: 0 }}
    >
      <span className="bb__idx rl-c2__idx rl-c2__whyspace" aria-hidden />
      <span className="rl-c2__onewhy">
        {gd ? <CornerDownRight size={12} strokeWidth={2.2} aria-hidden /> : <Layers size={12} strokeWidth={2.2} aria-hidden />}
        <span className="rl-c2__onetext">
          {gd && <>{ONE_OUTSIDE_HERE}, </>}
          <Name id={line.policyId} name={line.name} open={open} />
          {` · ${line.words}`}
        </span>
      </span>
    </motion.div>
  )
}
