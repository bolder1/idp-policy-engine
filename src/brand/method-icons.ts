import { BellRing, Fingerprint, HelpCircle, type LucideIcon, Mail, MessageSquare, Timer, Usb } from 'lucide-react'

/* A mark per MFA method, so a list of seven is scanned rather than read. The families are what the marks distinguish:
   something you are pushed, something you read off a clock, something you plug in or touch, something that arrives as a
   message. Keyed by the method's name, as the policy builder's lists are. Shared by the builder's factor pickers
   (board/WhatEditor.tsx) and a trusted device's Registration MFA method (device-profile-parts.tsx). */
export const METHOD_ICON: Record<string, LucideIcon> = {
  'miniOrange Push': BellRing,
  'miniOrange OTP': Timer,
  'Google Authenticator': Timer,
  'Microsoft Authenticator': Timer,
  'OTP over SMS': MessageSquare,
  'OTP over Email': Mail,
  'FIDO2 / Passkey': Fingerprint,
  'Yubikey Token': Usb,
  'Security Questions': HelpCircle,
}
