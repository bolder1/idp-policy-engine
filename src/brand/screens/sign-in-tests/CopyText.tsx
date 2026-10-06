import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

/* Copy plain text to the clipboard, "Copied" for a moment. The Why's Copy summary
   (why-summary.ts) and the activity drawer's (activity.ts). With no clipboard
   (an insecure page) it copies through a hidden field. */
export function CopyText({ text, label = 'Copy summary', className = 'bb__act tj-why__copy' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1600)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setDone(true)
      } catch {
        /* Nothing more to try. */
      }
      ta.remove()
    }
  }
  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={() => void copy()}>
      {done ? <Check size={14} strokeWidth={2.4} aria-hidden /> : <Copy size={14} strokeWidth={2} aria-hidden />}
      <span className="u-sr-only" aria-live="polite">
        {done ? 'Copied' : label}
      </span>
    </button>
  )
}
