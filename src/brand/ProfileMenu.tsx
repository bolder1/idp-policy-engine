import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Eraser, History, LayoutGrid, Lock, LogOut, RotateCcw, ScrollText, UserRound } from 'lucide-react'

import { Tip } from './kit'
import { DesignLock } from './DesignLock'
import { AccessLog } from './AccessLog'
import { FORCED_TESTER, HOME_LINE, LINE, LINE_EMAIL, LINE_NAMES, linesFor, needsLock, signOut, switchLine } from './lines'
import type { Line } from './lines'
import { MIGRATION_FIRST, START_AFTER_MIGRATION, bringBackOldPolicies } from './migrate/phase'
import { useBrand } from './store'
import { SHOWCASE } from './showcase'
import { shows } from './rollout'
import { RoleAvatar } from './role-avatar'
import { EMPTY_BY_MODE, EMPTY_TENANT } from './empty-tenant'
import { EmptyWipe } from './empty-wipe'
import { ROLE_ACCOUNT } from './role-account'

/* The admin's name and badge follow the line (rollout.ts `roleIdentity`), with the sign-in's email under the name. */
const ROLE_IDENTITY: boolean = shows('roleIdentity')
/* Go empty / Bring back data: a review tool, not product (empty-tenant.ts). Design only; not on the empty server, which
   has no way out. */
const GO_EMPTY: boolean = shows('emptyTenant') && !EMPTY_BY_MODE

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
  const { role, setRole, account, migrationStarted } = useBrand()
  const [open, setOpen] = useState(false)
  /* Roles (owner, 19 Nov 2026): the views this sign-in may open, decided by who signed in (HOME_LINE), not by the
     view open now. A designer sees all three and comes back to Design freely; anyone else asks for the passphrase. */
  const [locking, setLocking] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  /* The wipe playing: true while going empty, false while bringing data back. */
  const [wipe, setWipe] = useState<boolean | null>(null)
  const roles: Line[] = LINE && HOME_LINE && !FORCED_TESTER ? linesFor(HOME_LINE) : []
  /* On the console, the line names who is signed in; the User Dashboard keeps its end user. The tester deploy has no
     sign-in, so no email: the view's name stands under the role instead. */
  const roleLine: Line | null = ROLE_IDENTITY && role !== 'user' ? LINE : null
  const who = roleLine ? { name: ROLE_ACCOUNT[roleLine].name, username: LINE_EMAIL || ROLE_ACCOUNT[roleLine].username } : account
  const pickLine = (l: Line) => {
    close(false)
    if (l === LINE) return
    if (needsLock(HOME_LINE, l)) setLocking(true)
    else switchLine(l)
  }
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

  const items = () => [...(pop.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])]

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
        className={`bshell__avatar bpm__trigger${roleLine ? ' has-role' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${who.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        {roleLine ? <RoleAvatar line={roleLine} size={30} /> : account.initials}
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
              <span className={`bpm__whoav${roleLine ? ' has-role' : ''}`} aria-hidden>
                {roleLine ? <RoleAvatar line={roleLine} size={36} /> : account.initials}
              </span>
              <span className="bpm__whotext">
                <strong>{who.name}</strong>
                <em>{who.username}</em>
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

            {/* Bring back old policies (owner, 18 Nov 2026): the showcase opens after the migration, so this is the way
                back to before it, where the migration flow starts. Reloads the console once (migrate/phase.ts). */}
            {/* Go empty / Bring back data (owner, 20 Nov 2026): a review tool, not product (empty-tenant.ts). */}
            {GO_EMPTY && (
              <>
                <span className="bmenu__rule" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    close(false)
                    setWipe(!EMPTY_TENANT)
                  }}
                >
                  {EMPTY_TENANT ? <RotateCcw size={14} strokeWidth={1.9} aria-hidden /> : <Eraser size={14} strokeWidth={1.9} aria-hidden />}
                  {EMPTY_TENANT ? 'Bring back data' : 'Go empty'}
                </button>
              </>
            )}

            {MIGRATION_FIRST && START_AFTER_MIGRATION && migrationStarted && !EMPTY_TENANT && (
              <>
                <span className="bmenu__rule" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    close(false)
                    bringBackOldPolicies()
                  }}
                >
                  <History size={14} strokeWidth={1.9} aria-hidden />
                  Bring back old policies
                </button>
              </>
            )}

            {roles.length > 1 && (
              <>
                <span className="bmenu__rule" />
                <span className="bpm__group" role="presentation">
                  Role
                </span>
                {roles.map((l) => (
                  <button
                    key={l}
                    role="menuitemradio"
                    aria-checked={l === LINE}
                    type="button"
                    className="bpm__role"
                    onClick={() => pickLine(l)}
                  >
                    {needsLock(HOME_LINE, l) && l !== LINE ? (
                      <Lock size={14} strokeWidth={1.9} aria-hidden />
                    ) : (
                      <Check size={14} strokeWidth={1.9} aria-hidden style={{ visibility: l === LINE ? 'visible' : 'hidden' }} />
                    )}
                    {LINE_NAMES[l]}
                  </button>
                ))}
              </>
            )}

            {/* The owner's log: a designer's sign-in, whatever view is open. */}
            {HOME_LINE === 'design' && (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  close(false)
                  setLogOpen(true)
                }}
              >
                <ScrollText size={14} strokeWidth={1.9} aria-hidden />
                Access log
              </button>
            )}

            <span className="bmenu__rule" />
            {LINE && !FORCED_TESTER ? (
              <button role="menuitem" type="button" onClick={signOut}>
                <LogOut size={14} strokeWidth={1.9} aria-hidden />
                Sign out
              </button>
            ) : (
              unbuilt('Sign out', LogOut)
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {locking && (
        <DesignLock
          email={LINE_EMAIL}
          from={LINE ?? 'sign-in'}
          onClose={() => setLocking(false)}
          onUnlocked={() => switchLine('design')}
        />
      )}
      {logOpen && <AccessLog onClose={() => setLogOpen(false)} />}
      {wipe !== null && <EmptyWipe empty={wipe} />}
    </div>
  )
}
