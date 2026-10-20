import {
  Activity,
  Banknote,
  CalendarDays,
  ChartColumn,
  Clock,
  FileLock,
  FileText,
  Gauge,
  Globe,
  Hourglass,
  KeyRound,
  Laptop,
  ListFilter,
  type LucideIcon,
  MonitorCheck,
  MonitorSmartphone,
  Network,
  Plane,
  Radar,
  Repeat,
  Rows3,
  Send,
  ShieldCheck,
  Tag,
  Timer,
  UserRound,
  UserX,
  Users,
  VenetianMask,
  Webhook,
} from 'lucide-react'

/* One mark and one tone per condition, shared by the card, the editor and the
   catalogue so a Network zone looks the same in all three.
   Never `negative` — red means danger in this kit, and a network condition is
   not a danger. */

/* Keyed by the groups the catalogue actually has.

   These were `Network`, `Location`, `Device`, `Custom attributes` and
   `Webhooks` — a taxonomy this product stopped using when the library
   components were gathered under one heading. Nothing failed loudly: every
   lookup returned `undefined`, every condition fell back to the default, and
   the card drew eleven attributes in one grey. A stale key in a fallback map is
   the quietest kind of wrong there is.

   The fallback is what a NEW group gets before anybody chooses for it. Per
   attribute is below, and that is what actually runs. */
const GROUP_ICON: Record<string, LucideIcon> = {
  Library: Globe,
  Time: Clock,
  Attributes: ListFilter,
  Risk: Gauge,
  Group: Users,
  User: UserRound,
  /* A post sign-in policy's families (data.ts, phase 'post'). */
  Session: Hourglass,
  Device: Laptop,
  Network: Network,
  Event: FileText,
}

export const GROUP_TONE: Record<string, string> = {
  Library: 'info',
  Time: 'notice',
  Attributes: 'lime',
  Risk: 'positive',
  Group: 'neutral',
  User: 'neutral',
  Session: 'notice',
  Device: 'accent',
  Network: 'info',
  Event: 'magenta',
}

export const groupIcon = (g: string): LucideIcon => GROUP_ICON[g] ?? ListFilter

/* One mark per ATTRIBUTE, not per component.

   The mark used to be looked up by the condition's group, which worked while
   every group held one kind of thing. It stopped working the moment three
   different attributes moved under `Library`: a zone, a device profile and an
   external hook are the three most different things in the catalogue and they
   would all have come back with the fallback glyph, in a list whose only
   remaining distinction between rows is the mark and the word.

   Keyed by id, with the group as the fallback — so a new attribute gets its
   component's mark until somebody chooses one, rather than nothing. */
const COND_ICON: Record<string, LucideIcon> = {
  zone: Globe,
  fingerprint: MonitorSmartphone,
  webhook: Webhook,
  time: Clock,
  /* Not a clock. "Sign-in hours" and "Sign-in days" sit next to each other and are
     the pair most easily mistaken for one another; two clocks made the list
     read as one attribute drawn twice. */
  day: CalendarDays,
  'user-attr': Tag,
  'custom-attr': ListFilter,
  'device-risk': Gauge,
  /* A reading over time, not sparkles: nothing on this console is dressed as
     magic (describe spec, §8.4). */
  'ml-risk': Activity,
  group: Users,
  user: UserRound,
  /* A post sign-in policy's own (data.ts, 13 Oct 2026). */
  'session-age': Hourglass,
  'idle-time': Timer,
  'mfa-age': KeyRound,
  'device-compliance': ShieldCheck,
  'device-managed': MonitorCheck,
  'device-changed': Repeat,
  'ip-changed': Network,
  'impossible-travel': Plane,
  anonymous: VenetianMask,
  'user-risk': UserX,
  'risk-detection': Radar,
  records: Rows3,
  label: FileLock,
  destination: Send,
  amount: Banknote,
  volume: ChartColumn,
}

export const conditionIcon = (id: string, group: string): LucideIcon => COND_ICON[id] ?? groupIcon(group)

/* The tone, keyed the same way and for the same reason.

   Per GROUP would put one blue on `Network zone`, `Device profile` and
   `External hook` — the three rows the catalogue opens with, and the three most
   different things in it. A tint whose job is to say "these two are about the
   same kind of thing" must not say it about those.

   So `Library` splits three ways and the coherent families keep one tone each:
   the two Time rows are both amber and told apart by a clock against a
   calendar, the two Attributes rows are both lime, the two Risk rows are both
   green. Group and User stay neutral — they are the audience, not a
   circumstance, and the board draws them as faces rather than as conditions.

   Every ramp here is a CATEGORY, not a state. `positive` on Risk does not mean
   the risk is good; it means Risk is the green family. Red is the one tone
   never used, because a red row in a list of things you may choose reads as one
   you may not. */
const COND_TONE: Record<string, string> = {
  zone: 'info',
  fingerprint: 'accent',
  webhook: 'magenta',
  time: 'notice',
  day: 'notice',
  'user-attr': 'lime',
  'custom-attr': 'lime',
  'device-risk': 'positive',
  'ml-risk': 'positive',
  group: 'neutral',
  user: 'neutral',
  /* A post sign-in policy's: one tone per family, as above — the session amber
     with the clock, the device as the device profile, the network as the
     zone, risk green, the event's own details magenta. */
  'session-age': 'notice',
  'idle-time': 'notice',
  'mfa-age': 'notice',
  'device-compliance': 'accent',
  'device-managed': 'accent',
  'device-changed': 'accent',
  'ip-changed': 'info',
  'impossible-travel': 'info',
  anonymous: 'info',
  'user-risk': 'positive',
  'risk-detection': 'positive',
  records: 'magenta',
  label: 'magenta',
  destination: 'magenta',
  amount: 'magenta',
  volume: 'magenta',
}

export const conditionTone = (id: string, group: string): string =>
  COND_TONE[id] ?? GROUP_TONE[group] ?? 'neutral'
