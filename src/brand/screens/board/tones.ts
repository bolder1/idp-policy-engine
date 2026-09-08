import { CalendarDays, Clock, Fingerprint, Gauge, Globe, ListFilter, MapPin, MonitorSmartphone, Sparkles, Tag, UserRound, Users, Webhook, type LucideIcon } from 'lucide-react'

/* One mark and one tone per condition component, shared by the card, the
   editor and the catalogue so a Network condition looks the same in all three.
   Never `negative` — red means danger in this kit, and a network condition is
   not a danger. */

const GROUP_ICON: Record<string, LucideIcon> = {
  Network: Globe,
  Location: MapPin,
  Device: MonitorSmartphone,
  Risk: Gauge,
  User: Fingerprint,
  Group: Users,
  Time: Clock,
  'Custom attributes': ListFilter,
  Webhooks: Webhook,
}

export const GROUP_TONE: Record<string, string> = {
  Network: 'info',
  Location: 'lime',
  Device: 'accent',
  Risk: 'notice',
  User: 'magenta',
  Group: 'positive',
  Time: 'notice',
  'Custom attributes': 'neutral',
  Webhooks: 'neutral',
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
  /* Not a clock. "Time of day" and "Day of week" sit next to each other and are
     the pair most easily mistaken for one another; two clocks made the list
     read as one attribute drawn twice. */
  day: CalendarDays,
  'user-attr': Tag,
  'custom-attr': ListFilter,
  'device-risk': Gauge,
  'ml-risk': Sparkles,
  group: Users,
  user: UserRound,
}

export const conditionIcon = (id: string, group: string): LucideIcon => COND_ICON[id] ?? groupIcon(group)
