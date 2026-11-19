import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

import { Button } from './kit'
import { LINE_NAMES, clearLog, readLog } from './lines'
import './design-lock.css'

/* -----------------------------------------------------------------------------
   Who tried to unlock Design (owner, 19 Nov 2026: "I should know what is happening over there"). Design line only,
   from the profile menu. The log is this browser's: attempts made elsewhere are not here.
   -------------------------------------------------------------------------- */

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function AccessLog({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useState(readLog)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="bdl" role="presentation">
      <motion.div className="bdl__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div
        className="bdl__card bal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bal-title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h2 id="bal-title" className="bdl__title bal__title">
          Access log
        </h2>
        {log.length === 0 ? (
          <p className="bdl__sub">No attempts yet.</p>
        ) : (
          <table className="bal__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>From</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map((a) => (
                <tr key={a.at}>
                  <td>{when.format(a.at)}</td>
                  <td>{a.email || 'Unknown'}</td>
                  <td>{a.from === 'sign-in' ? 'Sign-in' : LINE_NAMES[a.from]}</td>
                  <td className={a.passed ? 'is-passed' : 'is-failed'}>{a.passed ? 'Unlocked' : 'Refused'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="bdl__actions">
          {log.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                clearLog()
                setLog([])
              }}
            >
              Clear log
            </Button>
          )}
          <Button variant="neutral" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
