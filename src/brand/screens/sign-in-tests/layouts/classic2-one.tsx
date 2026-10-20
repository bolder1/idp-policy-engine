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

export function OneReason({ why, appName, open }: { why: OneWhy; appName: string; open?: (policyId: string) => void }) {
  const words = oneReasonWords(why, appName)
  if (!words) return null
  return (
    <div className="rl-c2__under rl-c2__onereason" onClick={(e) => e.stopPropagation()}>
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

export function OneFoot({ also, gd, open, animate }: { also: OneLine | null; gd: OneLine | null; open?: (policyId: string) => void; animate: boolean }) {
  if (!also && !gd) return null
  return (
    <motion.div
      className="rl-c2__onefoot"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={animate ? { duration: 0.2, delay: 0.12, ease: EASE_OUT } : { duration: 0 }}
    >
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
    </motion.div>
  )
}
