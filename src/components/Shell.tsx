import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

import { useStore, type Screen } from '../state/store'

const NAV: { section: string; items: { label: string; screen?: Screen; disabled?: boolean }[] }[] = [
  {
    section: '',
    items: [{ label: 'Dashboard', disabled: true }, { label: 'Getting Started', disabled: true }],
  },
  {
    section: 'Configure',
    items: [
      { label: 'Identity Providers', disabled: true },
      { label: 'Apps', disabled: true },
      { label: 'Policies', screen: { name: 'coverage' } },
      { label: 'Simulate', screen: { name: 'simulate' } },
      { label: 'IP Ranges & Locations', screen: { name: 'objects' } },
      { label: 'Customization', disabled: true },
      { label: '2-Factor Authentication', disabled: true },
      { label: 'Provisioning', disabled: true },
    ],
  },
  {
    section: 'Manage',
    items: [
      { label: 'Users', disabled: true },
      { label: 'Groups', disabled: true },
      { label: 'Reports', disabled: true },
    ],
  },
]

function isActive(current: Screen, target?: Screen): boolean {
  if (!target) return false
  if (target.name === 'coverage') {
    return current.name === 'coverage' || current.name === 'builder' || current.name === 'resolution'
  }
  return current.name === target.name
}

export function Shell({ children }: { children: ReactNode }) {
  const { screen, go, toast } = useStore()
  const main = useRef<HTMLElement>(null)

  // Arriving at a new screen part-way down the previous screen's scroll offset
  // hides the top of what you just opened — the policy builder in particular
  // opens below its own header.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [screen])

  return (
    <div className="shell">
      <aside className="shell__nav">
        <div className="shell__brand">
          <span className="shell__mark">x</span>
          <span className="shell__wordmark">
            xecurify
            <em>by miniOrange</em>
          </span>
        </div>

        <nav className="shell__sections">
          {NAV.map((group, i) => (
            <div key={group.section || i} className="shell__section">
              {group.section && <p className="shell__section-title">{group.section}</p>}
              {group.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  className={`shell__link ${isActive(screen, item.screen) ? 'is-active' : ''}`}
                  onClick={() => item.screen && go(item.screen)}
                >
                  {isActive(screen, item.screen) && (
                    <motion.span layoutId="nav-active" className="shell__link-bg" />
                  )}
                  <span className="shell__link-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="shell__footer">
          <span className="shell__avatar">JT</span>
          <span>Jaspreet T.</span>
        </div>
      </aside>

      <main className="shell__main" ref={main}>
        {children}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
