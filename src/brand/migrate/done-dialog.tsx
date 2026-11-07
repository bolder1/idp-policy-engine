import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check } from 'lucide-react'
import { Button, Modal } from '../kit'
import { useBrand } from '../store'
import './done-dialog.css'

/* -----------------------------------------------------------------------------
   What next (owner, 5 Nov 2026: "a proper pop-up ... the user can skip it", then
   "minimal"). Replaces the Done page: a mark, one line, two buttons (popups carry two at
   most, 23 Oct). Done: Check access, the one step worth taking first, or Skip to
   Policies. Still waiting: Back to review, or Skip.
   -------------------------------------------------------------------------- */

export function MoveDoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const waiting = Object.values(store.moved).filter((m) => !m.approved).length
  const skip = () => {
    onClose()
    store.go({ name: 'policies' })
  }
  const check = () => {
    onClose()
    store.markSetup('check')
    store.go({ name: 'sign-in-tests' })
  }
  return (
    <Modal open={open} onClose={skip} title="What next" width={460} bare>
      <div className="bwn">
        <motion.span className="bwn__mark" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.1 }}>
          <Check size={26} strokeWidth={2.6} aria-hidden />
        </motion.span>
        <h2>{waiting === 0 ? 'Your policies are in the new builder' : 'Review is done for now'}</h2>
        <p>
          {waiting === 0
            ? 'They are drafts. Check access before you make them active.'
            : `${waiting === 1 ? '1 moved policy still waits' : `${waiting} moved policies still wait`} for approval.`}
        </p>
        <footer className="bwn__foot">
          <Button variant="secondary" onClick={skip}>
            Skip for now
          </Button>
          {waiting === 0 ? (
            <Button variant="brand" iconRight={ArrowRight} onClick={check}>
              Check access
            </Button>
          ) : (
            <Button variant="brand" onClick={onClose}>
              Back to review
            </Button>
          )}
        </footer>
      </div>
    </Modal>
  )
}
