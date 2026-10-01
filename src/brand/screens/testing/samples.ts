import type { App, User } from '../../data'
import { TENANT_TZ, type SignInFacts } from '../sign-in-facts'
import { devicePreset } from './device-presets'

/* -----------------------------------------------------------------------------
   Sample sign-ins: nine sign-ins an admin can load into Try with one click.

   Each is a scene the showcase tenant was built to answer. With HRMS on, each
   answers it differently — HR in the office gets 2FA, HR at home is refused, a
   salesperson on HRMS falls through to the Global Default, a sign-in with no
   address can't be told. Nine answers a tester would otherwise have to state
   field by field before seeing one.

   The showcase opens with HRMS Inactive (Phase 4), and a sample is read as the
   tenant stands: until HRMS is turned on, the HRMS scenes read the Global
   Default — Allow on 1 factor, from India on the corporate laptop each states
   (its rule 1 since 30 Sep 2026), and Can't tell for the one with no address,
   because the Global Default reads the country too (samples.test.ts pins
   both).

   Samples are NOT saved sign-ins. A saved sign-in is a promise the tenant keeps
   ("Kavya in the office must keep getting 2FA") and the guard checks it; a
   sample promises nothing, and no decision is stored with it. The Samples view
   evaluates each one live, so a sample always shows what the tenant does now.
   Saving one is how it becomes a promise.

   Every sample states its time — Monday 28 Sep 2026, 09:30 in Kolkata — so a
   rule that reads the clock gives the same answer whatever day the page is
   opened on. The office sample is 203.0.113.24, the office preset's own
   address (Pune, AS64500), so a sample loaded into Try lights the Office
   network chip.

   A sample whose person or application the tenant does not have is not shown
   (`samplesIn`): it would load a sign-in for nobody.
   -------------------------------------------------------------------------- */

export interface SampleSignIn {
  id: string
  /** What the row says: the scene, not the answer. */
  name: string
  facts: SignInFacts & { personId: string; appId: string }
}

const MONDAY_0930: NonNullable<SignInFacts['when']> = { date: '2026-09-28', time: '09:30', timeZone: TENANT_TZ, source: 'stated' }
const at = (address: string): NonNullable<SignInFacts['network']> => ({ address, source: 'stated' })
const LOW_RISK: NonNullable<SignInFacts['risk']> = { score: 12, source: 'stated' }
/* The HRMS scenes' device: HRMS never reads one, but the Global Default that
   decides while HRMS is off does, so it is stated rather than left to depend. */
const CORP_LAPTOP = devicePreset('win11-registered').facts

export const SAMPLE_SIGN_INS: readonly SampleSignIn[] = [
  { id: 'hr-office', name: 'HR in the office', facts: { personId: 'u-hr-1', appId: 'hrms', network: at('203.0.113.24'), when: MONDAY_0930, device: CORP_LAPTOP } },
  { id: 'hr-home', name: 'HR at home', facts: { personId: 'u-hr-2', appId: 'hrms', network: at('192.0.2.10'), when: MONDAY_0930, device: CORP_LAPTOP } },
  { id: 'sales-hrms', name: 'Sales on HRMS', facts: { personId: 'u-sales-1', appId: 'hrms', network: at('203.0.113.24'), when: MONDAY_0930, device: CORP_LAPTOP } },
  /* The one that can't be told: the office rule reads the address, and none was given. */
  { id: 'no-address', name: 'No address given', facts: { personId: 'u-hr-1', appId: 'hrms', when: MONDAY_0930 } },
  {
    id: 'android-12',
    name: 'Contractor on Android 12',
    facts: { personId: 'devon', appId: 'outlook', when: MONDAY_0930, device: devicePreset('android-12').facts },
  },
  {
    id: 'personal-laptop',
    name: 'Personal laptop',
    facts: { personId: 'u-sales-2', appId: 'google-workspace', when: MONDAY_0930, device: devicePreset('win11-no-agent').facts, risk: LOW_RISK },
  },
  {
    id: 'third-device',
    name: 'Third device',
    facts: {
      personId: 'u-sales-3',
      appId: 'google-workspace',
      when: MONDAY_0930,
      /* Two devices registered already, and this one not among them. */
      device: { ...devicePreset('win11-unregistered').facts, registeredCount: 2 },
      risk: LOW_RISK,
    },
  },
  {
    id: 'medium-risk',
    name: 'Registered laptop, medium risk',
    facts: { personId: 'u-sales-3', appId: 'google-workspace', when: MONDAY_0930, device: devicePreset('win11-registered').facts, risk: { score: 48, source: 'stated' } },
  },
  {
    id: 'dev-office',
    name: 'Developer in the office',
    facts: { personId: 'arun', appId: 'github', network: at('203.0.113.10'), when: MONDAY_0930, device: devicePreset('win11-registered').facts },
  },
]

/** The samples this tenant can load: the ones whose person and application it has. */
export function samplesIn(people: readonly Pick<User, 'id'>[], apps: readonly Pick<App, 'id'>[]): SampleSignIn[] {
  return SAMPLE_SIGN_INS.filter((s) => people.some((u) => u.id === s.facts.personId) && apps.some((a) => a.id === s.facts.appId))
}
