import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutGrid, Lock, LogOut, UserRound } from 'lucide-react'

import { Tip } from './kit'
import { useBrand } from './store'
import { SHOWCASE } from './showcase'

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

   Who the menu names comes from the store (`account`), so the avatar and the
   identity block always agree. Personal Profile, Change Password and Sign out
   are not built in this prototype, and their Tips say so.
   -------------------------------------------------------------------------- */

/* The showcase build says what a customer would be told (see showcase.ts). */
const NOT_BUILT = SHOWCASE ? 'Coming soon.' : 'Not built in this prototype.'

/* Switching sides swaps the whole shell, so the avatar that was used is gone.
   The avatar in the new shell takes focus when it mounts, instead of focus
   falling to the page. */
let focusAvatarOnMount = false

export function ProfileMenu() {
  const { role, setRole, account } = useBrand()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusAvatarOnMount) return
    focusAvatarOnMount = false
    trigger.current?.focus()
  }, [])

  /* Closing from inside the menu puts focus back on the avatar; otherwise the
     focused item unmounts with the menu and focus falls to the page. */
  const close = (restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }

  /* Closes on a click anywhere else and on Escape. A menu anchored to the
     top-right corner of every page is the one that most needs to be dismissible
     without aiming. */
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const inside = wrap.current?.contains(document.activeElement)
      setOpen(false)
      if (inside) trigger.current?.focus()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const items = () => [...(pop.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]

  /* Focus the first item once the menu is in the page. */
  useEffect(() => {
    if (open) items()[0]?.focus()
  }, [open])

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const move = (i: number) => {
      e.preventDefault()
      all[(i + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(all.length - 1)
    else if (e.key === 'Tab') setOpen(false)
  }

  const goingTo = role === 'admin' ? 'user' : 'admin'

  /* A grid cell around the Tip, so its inline wrapper stretches to the menu's
     width and the item lays out like the others. */
  const unbuilt = (label: string, Icon: typeof UserRound) => (
    <div role="none" style={{ display: 'grid' }}>
      <Tip text={NOT_BUILT} placement="top">
        <button role="menuitem" type="button" aria-disabled="true" onClick={() => close(true)}>
          <Icon size={14} strokeWidth={1.9} aria-hidden />
          {label}
        </button>
      </Tip>
    </div>
  )

  return (
    <div className="bpm" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="bshell__avatar bpm__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${account.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        {account.initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={pop}
            className="bmenu bpm__pop"
            role="menu"
            aria-label="Account"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.13 }}
          >
            {/* The identity block the live menu opens with — who you are, above
                what you can do about it. */}
            <div className="bpm__who">
              <span className="bpm__whoav" aria-hidden>
                {account.initials}
              </span>
              <span className="bpm__whotext">
                <strong>{account.name}</strong>
                <em>{account.username}</em>
              </span>
            </div>

            {unbuilt('Personal Profile', UserRound)}
            {unbuilt('Change Password', Lock)}

            {/* The switch, named after where it takes you rather than after what
                you currently are — "User Dashboard" from the admin side, "Admin
                Dashboard" from the user side. It reads as a destination, which
                is what it is. */}
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                /* Back on this avatar first, so a leave dialog returns here on Keep editing. */
                close(true)
                focusAvatarOnMount = true
                setRole(goingTo)
              }}
            >
              {goingTo === 'user' ? (
                <LayoutGrid size={14} strokeWidth={1.9} aria-hidden />
              ) : (
                <LayoutGrid size={14} strokeWidth={1.9} aria-hidden />
              )}
              {goingTo === 'user' ? 'User Dashboard' : 'Admin Dashboard'}
            </button>

            <span className="bmenu__rule" />
            {unbuilt('Sign out', LogOut)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
