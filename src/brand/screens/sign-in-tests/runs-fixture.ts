import type { RunFixture } from './runs'

/* -----------------------------------------------------------------------------
   The Runs tab's history: the saved sign-ins run by the checks that ran over
   the last week (V4 §3.1, §5). A FIXTURE — this prototype keeps no log — and
   the page says so with a "Sample" badge on every one of these.

   Plausible rather than invented at random:

     - every item names a REAL saved sign-in on the showcase tenant
       (showcase-seed.ts, `showcaseSavedSignIns`), and only sign-ins on the
       applications the change touched;
     - every trigger names a real policy, zone or device profile by id, so its
       title follows a rename (runs.ts, `triggerTitle`);
     - before and after are what the scene plausibly did: the Global Default
       allowed everybody on one factor before Developer tools and Device
       compliance were turned on, and turning them on moved exactly the
       sign-ins those policies now refuse or step up;
     - who ran it is one of the tenant's admins, or System for the nightly
       check, which only reports and so changes nothing;
     - it agrees with the tenant as seeded: each sign-in's latest After is
       what the live run above it says now, and each Before is what the run
       before it left (runs.test.ts pins both). HRMS access is Inactive in the
       seed, so the Global Default has decided HRMS all week — one factor for
       everybody — and no HRMS item here says otherwise.

   Times are hours before "now", which the page passes in, so the list always
   reads "2 h ago", "Yesterday", "3 days ago" whatever day it is opened.
   Newest first.
   -------------------------------------------------------------------------- */

export const RUNS_FIXTURE: readonly RunFixture[] = [
  /* The HRMS policy's latest save. It is saved switched off, so the Global
     Default still decides HRMS and not one sign-in on it moved — the run
     says so, and Kavya's and Neha's promises (2FA, Deny) stay broken until
     the policy is turned on. */
  {
    id: 'run-hrms-save',
    trigger: { verb: 'Saving', kind: 'policy', id: 'sc-hrms-office' },
    who: 'Jaspreet Toor',
    hoursAgo: 2,
    items: [
      { savedId: 'ssi-kavya-office', before: '1fa', after: '1fa' },
      { savedId: 'ssi-neha-home', before: '1fa', after: '1fa' },
      { savedId: 'ssi-aisha-hrms', before: '1fa', after: '1fa' },
      { savedId: 'ssi-ravi-hrms', before: '1fa', after: '1fa' },
    ],
  },
  /* The branch office's block added to Corporate offices, hours after
     Developer tools went on: Arun at the branch now counts as in the office,
     so his compliant laptop is back to one factor. HRMS reads the same zone,
     and its sign-ins stood still. */
  {
    id: 'run-zone-offices',
    trigger: { verb: 'Editing', kind: 'zone', id: 'corp-offices' },
    who: 'Rahul Verma',
    hoursAgo: 20,
    items: [
      { savedId: 'ssi-kavya-office', before: '1fa', after: '1fa' },
      { savedId: 'ssi-neha-home', before: '1fa', after: '1fa' },
      { savedId: 'ssi-arun-office', before: '2fa', after: '1fa' },
      { savedId: 'ssi-sofia-london', before: '2fa', after: '2fa' },
    ],
  },
  /* Turning on Developer tools: before, the Global Default let every one of
     these in on a password. After, a compliant device away from the offices
     steps up — the branch was not in the zone yet, so Arun did too — Windows
     10 is refused, and the contractor, outside the audience, is untouched. */
  {
    id: 'run-dev-tools-on',
    trigger: { verb: 'Turning on', kind: 'policy', id: 'sc-dev-tools' },
    who: 'Anika Rao',
    hoursAgo: 26,
    items: [
      { savedId: 'ssi-arun-office', before: '1fa', after: '2fa' },
      { savedId: 'ssi-sofia-london', before: '1fa', after: '2fa' },
      { savedId: 'ssi-tom-win10', before: '1fa', after: 'deny' },
      { savedId: 'ssi-contractor-jira', before: '1fa', after: '1fa' },
    ],
  },
  /* Device compliance on: the Android 12 phone and the unmanaged Mac are
     refused; the iPhone and the Android 14 phone pass the checks. */
  {
    id: 'run-compliance-on',
    trigger: { verb: 'Turning on', kind: 'policy', id: 'sc-device-compliance' },
    who: 'Anika Rao',
    hoursAgo: 74,
    items: [
      { savedId: 'ssi-devon-android', before: '1fa', after: 'deny' },
      { savedId: 'ssi-sanjay-iphone', before: '1fa', after: '1fa' },
      { savedId: 'ssi-priya-mac', before: '1fa', after: 'deny' },
      { savedId: 'ssi-ivy-android', before: '1fa', after: '1fa' },
    ],
  },
  /* The nightly check reports; it changes nothing. */
  {
    id: 'run-nightly-3',
    trigger: { verb: 'Nightly check' },
    who: 'System',
    hoursAgo: 80,
    items: [
      { savedId: 'ssi-kavya-office', before: '1fa', after: '1fa' },
      { savedId: 'ssi-neha-home', before: '1fa', after: '1fa' },
      { savedId: 'ssi-aisha-hrms', before: '1fa', after: '1fa' },
      { savedId: 'ssi-ravi-hrms', before: '1fa', after: '1fa' },
      { savedId: 'ssi-vikram-laptop', before: '1fa', after: '1fa' },
      { savedId: 'ssi-rahul-medium', before: '2fa', after: '2fa' },
      { savedId: 'ssi-emily-high', before: 'deny', after: 'deny' },
      { savedId: 'ssi-aisha-laptop', before: 'deny', after: 'deny' },
    ],
  },
  /* The risk bands re-cut on the corporate-devices policy: medium risk now
     asks for OTP, high risk is refused. */
  {
    id: 'run-corp-devices-edit',
    trigger: { verb: 'Editing', kind: 'policy', id: 'sc-corporate-devices' },
    who: 'Jaspreet Toor',
    hoursAgo: 98,
    items: [
      { savedId: 'ssi-vikram-laptop', before: '1fa', after: '1fa' },
      { savedId: 'ssi-rahul-medium', before: '1fa', after: '2fa' },
      { savedId: 'ssi-emily-high', before: '2fa', after: 'deny' },
      { savedId: 'ssi-aisha-laptop', before: 'deny', after: 'deny' },
    ],
  },
  {
    id: 'run-nightly-5',
    trigger: { verb: 'Nightly check' },
    who: 'System',
    hoursAgo: 122,
    items: [
      { savedId: 'ssi-vikram-laptop', before: '1fa', after: '1fa' },
      { savedId: 'ssi-aisha-laptop', before: 'deny', after: 'deny' },
      { savedId: 'ssi-kavya-office', before: '1fa', after: '1fa' },
      { savedId: 'ssi-ravi-hrms', before: '1fa', after: '1fa' },
    ],
  },
  /* Corporate devices' profile made the agent a requirement: the personal
     laptop without it, allowed before on its low risk, is refused. */
  {
    id: 'run-profile-corp',
    trigger: { verb: 'Editing', kind: 'profile', id: 'fp-corp-devices' },
    who: 'Rahul Verma',
    hoursAgo: 146,
    items: [
      { savedId: 'ssi-vikram-laptop', before: '1fa', after: '1fa' },
      { savedId: 'ssi-aisha-laptop', before: '1fa', after: 'deny' },
    ],
  },
]
