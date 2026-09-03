import { Clock, Fingerprint, Gauge, Globe, ListFilter, MapPin, MonitorSmartphone, Users, Webhook, type LucideIcon } from 'lucide-react'

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
