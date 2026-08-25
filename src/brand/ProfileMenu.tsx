import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { KeyRound, LayoutGrid, LogOut, ShieldCheck, UserRound } from 'lucide-react'

import { useBrand } from './store'

/* -----------------------------------------------------------------------------
   The account menu, and the only way between the two sides.

   Measured off the live console rather than designed: the same menu hangs off
   the avatar in both places, and the two are identical except for the third
   item, which names the side you are NOT on.

     admin console   Personal Profile · Change Password · User Dashboard  · Sign out
     end-user site   Personal Profile · Change Password · Admin Dashboard · Sign out

   That symmetry is the whole navigation model, and it is worth keeping for a
   reason beyond fidelity: it makes switching an account action rather than a
   view setting. You are not filtering a screen, you are going to the other
   site — which is exactly what the product does, and why the switch does not
   belong on a page. It used to sit above the methods screen as a "Viewing as"
   dropdown, which put a global move inside one tab and implied the other tabs
   had their own.
   -------------------------------------------------------------------------- */

export function ProfileMenu({ initials = 'JT' }: { initials?: string }) {
  const { role, setRole } = useBrand()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  /* Closes on a click anywhere else and on Escape. A menu anchored to the
     top-right corner of every page is the one that most needs to be dismissible
     without aiming. */
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const goingTo = role === 'admin' ? 'user' : 'admin'

  return (
    <div className="bpm" ref={wrap}>
      <button
        type="button"
        className="bshell__avatar bpm__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="bmenu bpm__pop"
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.13 }}
          >
            {/* The identity block the live menu opens with — who you are, above
                what you can do about it. */}
            <div className="bpm__who">
              <span className="bpm__whoav" aria-hidden>
                {initials}
              </span>
              <span className="bpm__whotext">
                <strong>Jaspreet Toor</strong>
                <em>jaspreet_t</em>
              </span>
            </div>

            <button role="menuitem" type="button" onClick={() => setOpen(false)}>
              <UserRound size={14} strokeWidth={1.9} aria-hidden />
              Personal Profile
            </button>
            <button role="menuitem" type="button" onClick={() => setOpen(false)}>
              <KeyRound size={14} strokeWidth={1.9} aria-hidden />
              Change Password
            </button>

            {/* The switch, named after where it takes you rather than after what
                you currently are — "User Dashboard" from the admin side, "Admin
                Dashboard" from the user side. It reads as a destination, which
                is what it is. */}
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                setRole(goingTo)
              }}
            >
              {goingTo === 'user' ? (
                <LayoutGrid size={14} strokeWidth={1.9} aria-hidden />
              ) : (
                <ShieldCheck size={14} strokeWidth={1.9} aria-hidden />
              )}
              {goingTo === 'user' ? 'User Dashboard' : 'Admin Dashboard'}
            </button>

            <span className="bmenu__rule" />
            <button role="menuitem" type="button" onClick={() => setOpen(false)}>
              <LogOut size={14} strokeWidth={1.9} aria-hidden />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
