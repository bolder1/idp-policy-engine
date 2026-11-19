import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MIGRATION_FIRST, MIGRATION_PICKERS } from '../migrate/phase'
import { OldPoliciesTab } from '../migrate/old-tab'
import { BANNER_VARIANTS, setBannerVariant, useBannerVariant, type BannerVariant } from '../migrate/banner-variant'
import { RejectDialog } from '../migrate/migration-results'
import { EXPERIENCES, isBuilt, clearRejected, markRolledBack, setExperience, useExperience, useReviewFacts, type MigrationExperience } from '../migrate/experience'
import { MigrationResults } from '../migrate/migration-results'
import {
  AlignLeft,
  AppWindow,
  CopyPlus,
  Eye,
  Grid3x3,
  ListFilter,
  ListChecks,
  LogIn,
  Pencil,
  Plus,
  Power,
  Rocket,
  PowerOff,
  Radar,
  Table2,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Waypoints,
  Undo2,
  Headset,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react'
import { TemplateIcon } from '../template-icon'

import { PageHead } from '../Shell'
import { Coverage } from './Coverage'
import { AppsPeek } from './apps-peek'
import { Badge, Button, Confirm, Modal, RowMenu, SearchBox, StatusPill, Tabs, Tip, type MenuItem } from '../kit'
import { LibraryRows, ViewSwitch, type LibRow } from './library-view'
import type { LibView, ViewOption } from './library-view-state'
import { PageBar } from './page-bar'
import { MoreFilters } from './more-filters'
import { NO_FILTERS, anySet, policyMatches, type PolicyFilters } from './more-filters-model'
import { Picker } from '../picker'
import { appsOf, blankPolicy, enforces, type Policy } from '../data'
import { useBrand } from '../store'
import { ChangeState } from '../leave-guard'
import { EmptyState, NoMatches } from '../empty'
import { newPolicy } from '../policy-draft'
import { useNewPolicy } from '../create/use-new-policy'
import { useMarkedAsTemplate, useSaveAsTemplate } from './save-template'
import { ConfirmDelete } from './confirm-delete'
import { AppTransfer } from './app-transfer'
import { decidesFor, deleteFacts, ownerOf } from './app-policies'
import { AppFacts, DeleteFactsLine, PolicyFact } from './app-facts'
import { runGauntlet, type GauntletResult } from './gauntlet'
import type { SimEnv } from './simulate'
import { canSaveAsTemplate, rowMenu, statusOptions, type RowMenuId, monitorOffered, MONITOR_MODE } from './status-options'
import { useStatusChange } from './use-status-change'
import { BulkBar } from '../bulk-bar'
import { SHOWCASE } from '../showcase'
import { TESTER } from '../tester'
import { screenOffered } from '../edition-screens'
import { ReadAsTextDrawer } from './board/ReadAsTextPanel'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { DENIAL_REASONS } from './sign-in-tests/phase'
import { PolicyDetailsDrawer } from './policy-details-drawer'
import { blankPostSignInPolicy, isPostSignIn } from '../post-sign-in'
import { blockedReason } from '../migrate/plan'
import { activityLabel, lastActivity } from '../policy-activity'
import { MoveBanner } from '../migrate/move-banner'
import { MigrateEmpty } from '../migrate/MoveDialog'
import { MoveFinale, MovingBar, MovingShowcase } from '../migrate/finale'
import { PublishMovedConfirm } from '../migrate/moved-panel'
/* Here and not in main.tsx's list, against that list's rule, because it can be:
   the sheet sets only margins, on its own class and on the page head through
   `:has()`, which out-weighs console-theme's rule rather than tying with it. So
   landing before kit.css (Policies is eager) leaves source order nothing to decide. */
import './policies-types.css'
import { FirstVisit } from '../migrate/first-visit'
import { PolicyStatus } from '../migrate/moved-status'
import { MARK_LABEL, UNMARK_LABEL } from '../tester'

/* -----------------------------------------------------------------------------
   Policies — the list.

   Two policy types, on two line tabs under the head (owner, 13 Oct 2026;
   docs/specs/POST-SIGN-IN-POLICIES.md, Screens 1): Sign-in, decided once as
   somebody signs in, and Post sign-in, acting on events in the session after
   it. They are kept apart, so each tab is its own list with its own bar.

   Sign-in: name, applications, status and the row menu; Exposure too in the
   full edition. One status filter and a search. Every dialog a row opens lives
   on the page, not in the row, so a row that is deleted or filtered out does
   not take its dialog — and the keyboard focus — with it.
   -------------------------------------------------------------------------- */

type PolicyKind = 'sign-in' | 'moved' | 'post-sign-in' | 'old'

/* No counts on the tabs (15 Sep 2026): the number is the list's own. */
const POLICY_KINDS: { value: PolicyKind; label: string }[] = MIGRATION_FIRST
  ? [
      /* Migration first (migrate/phase.ts): the migrated policies and the old ones; Sign-in and Post sign-in wait. */
      { value: 'sign-in', label: 'New policies' },
      { value: 'moved', label: 'Migrated policies' },
      { value: 'old', label: 'Old policies' },
    ]
  : [
      { value: 'sign-in', label: 'Sign-in' },
      { value: 'post-sign-in', label: 'Post sign-in' },
    ]

/* The tab a viewer last had open, so the way back from the board — opened
   from the Post sign-in tab, by its New policy or a policy's name — lands on
   Post sign-in again. A convenience only. Storage is read first; where it is
   blocked or empty, the module copy still holds the tab for this visit, and
   with neither the page opens on Sign-in. */
const KIND_KEY = 'brand-policies-type'
let lastKind: PolicyKind | null = null

function readKind(): PolicyKind {
  try {
    const stored = localStorage.getItem(KIND_KEY)
    if (stored && POLICY_KINDS.some((k) => k.value === stored)) return stored as PolicyKind
  } catch {
    /* Blocked: fall through to this visit's copy. */
  }
  return lastKind ?? 'sign-in'
}

function keepKind(kind: PolicyKind) {
  lastKind = kind
  try {
    localStorage.setItem(KIND_KEY, kind)
  } catch {
    /* Blocked: the module copy holds it. */
  }
}

type SortKey = 'name' | 'modified' | 'exposure' | 'activity'
type StatusFilter = 'all' | 'draft' | 'active' | 'monitor' | 'inactive'
type RowAction = RowMenuId | 'assign'
type RowDialog = { kind: 'delete' | 'assign' | 'template' | 'text'; policy: Policy }

/* -----------------------------------------------------------------------------
   Exposure — withheld in every edition since M4.

   The chip deck runs against every row. The column shows the finding rather
   than the letter — "5 got through" is actionable where "F" is not — and
   clicking it opens that policy's Break-in test, wherever the version in force
   keeps it. The grade is retired (owner, 25 Sep 2026: counts, not a grade), so
   `FULL.exposure` is false too; the column is kept behind its flag so the
   comparison can be put back by flipping one value (edition.ts).
   -------------------------------------------------------------------------- */
function exposureOf(r: GauntletResult) {
  if (r.breaches > 0) return { tone: 'bad' as const, label: `${r.breaches} got through`, rank: 3 }
  if (r.lockouts > 0) return { tone: 'warn' as const, label: `${r.lockouts} locked out`, rank: 2 }
  if (r.friction > 2) return { tone: 'notice' as const, label: `${r.friction} over-challenged`, rank: 1 }
  return { tone: 'ok' as const, label: 'Nothing got through', rank: 0 }
}

/* In the order they are used: what decides sign-ins first. They were out as
   segments across the bar until 23 Sep 2026 — owner: "remove the open filter
   from Policies, just add a filter icon" — so status now answers in the same
   one-line dropdown every other library page uses. */
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  /* Monitoring is not a status the product has (owner, 18 Nov 2026: "monitoring is not a concept at all, remove
     completely"); it stays only behind MONITOR_MODE, with the rest of that work. */
  ...(MONITOR_MODE ? [{ value: 'monitor' as StatusFilter, label: 'Monitoring' }] : []),
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
]

/* The ONE policies view is the TABLE (owner, 16 Sep 2026). The same day it
   went table/list/card, then list only — "the list view" having meant the
   table, which this page called List before it had three — and then back to
   the table. The list and card renderings below are still in the source behind
   this one word. Typed wide on purpose, so those branches still compile. */
const POLICY_VIEW: LibView = 'table'

/* Coverage is not one of the three library views; it is the matrix, and only
   where the product has it. Where it does, the switch is the two options the
   page had before today: the table, and Coverage. */
type PolicyView = 'table' | 'coverage'
const POLICY_VIEWS: ViewOption<PolicyView>[] = [
  { id: 'table', label: 'Table view', icon: Table2 },
  { id: 'coverage', label: 'Coverage view', icon: Grid3x3 },
]

/* The preview switch (owner, 3 Nov 2026: "two dropdowns, one for the empty state, one with content"): the new builder
   as a tenant first meets it, or with the showcase's policies. Shown in the showcase too, because he asked for it there. */
/* Two tabs, and inside New policies two lists (owner, 10 Nov 2026: "inside New policies, two tabs, on the left, segregated"):
   the policies made here, and the migrated drafts waiting for review. A published migrated policy joins the first,
   tagged Migrated, and its old policies panel goes. */
/* Two versions of New policies (owner, 10 Nov 2026: "with tabs, the current one; no tabs, the old one, the single table"):
   with tabs, two lists with a nav on the left; no tabs, one table with the migrated drafts among the rest. A preview
   switch, in the showcase too, because he asked for the dropdown. */
type NewSub = 'new' | 'moved'
const NEW_SUBS: { value: NewSub; label: string }[] = [
  { value: 'new', label: 'Live policies' },
  { value: 'moved', label: 'Under review' },
]
/* Assisted and Self-serve (owner, 16 Nov 2026): two places, Policies for the policies and Migration for the work. */
const NEW_SUBS_REVIEW: { value: NewSub; label: string }[] = [
  { value: 'new', label: 'Policies' },
  { value: 'moved', label: 'Migration' },
]

const START_OPTIONS = [
  { value: 'empty', label: 'Empty' },
  { value: 'seeded', label: 'With policies' },
]

export function Policies() {
  const store = useBrand()
  const [kind, setKind] = useState<PolicyKind>(readKind)
  const [sub, setSub] = useState<NewSub>(() => (readKind() === 'moved' ? 'moved' : 'new'))
  /* Two tabs: a stored Migrated tab is New policies' second list. */
  const shown = kind === 'moved' ? 'sign-in' : kind
  const kinds = POLICY_KINDS.filter((k) => k.value !== 'moved')
  const show = (k: PolicyKind) => {
    setKind(k)
    keepKind(k)
  }
  /* Asked for a list by the route (the move tour): New policies, on that list. */
  const askedSub = store.screen.name === 'policies' ? store.screen.sub : undefined
  useEffect(() => {
    if (!askedSub) return
    setKind('sign-in')
    setSub(askedSub)
  }, [askedSub, store.screen])
  /* A move starting opens the Migrated list: the policies it makes land there, drafts first. */
  const running = store.moveJob?.status === 'running'
  const bannerVariant = useBannerVariant()
  const experience = useExperience()
  const hasMoved = running || store.policies.some((p) => !!p.movedFrom?.length)
  useEffect(() => {
    if (running && MIGRATION_FIRST) {
      setKind('sign-in')
      keepKind('sign-in')
      setSub('moved')
    }
  }, [running])

  /* The phase 1 tester build (tester.ts): the sign-in policies alone, no tabs, no migration (owner, 18 Nov 2026: "remove
     new policy, old policy, all those … just give me the fresh version of the policy builder"). */
  if (TESTER)
    return (
      <div className="bpage">
        <PageHead title="Policies" caption="Every sign-in is checked against these policies." docs />
        <div className="bpol__main">
          <SignInPolicies key="new" origin="new" />
        </div>
      </div>
    )

  /* One head over both tabs, so its caption names both types rather than
     only the sign-in check it said before 13 Oct 2026. */
  return (
    <div className="bpage">
      <PageHead
        title="Policies"
        caption="Every sign-in, and the session after it, is checked against these policies."
        docs
        preview={
          MIGRATION_PICKERS && (
          <>
          <Picker
            label="Start"
            size="md"
            prefix="Start"
            value={store.builderStart}
            options={START_OPTIONS}
            onChange={(v) => store.setBuilderStart(v as 'empty' | 'seeded')}
          />
          {/* The migration experience, for the review of the three variations (owner, 16 Nov 2026): Today as built,
              Assisted (approve or reject), Self-serve (edit and approve). */}
          <Picker label="Experience" size="md" prefix="Experience" value={experience} options={EXPERIENCES} onChange={(v) => setExperience(v as MigrationExperience)} />
          {/* The migration banner while drafts wait: two cards, or the one it was (owner, 12 Nov 2026). Today only. */}
          {isBuilt(experience) && <Picker label="Banner" size="md" prefix="Banner" value={bannerVariant} options={BANNER_VARIANTS} onChange={(v) => setBannerVariant(v as BannerVariant)} />}
          </>
          )
        }
      />
      {/* The migration banner sits above the tabs (owner, 10 Nov 2026), and steps aside while a move runs full page. */}
      {/* With tabs, the migration banner belongs to the Migrated list (owner, 10 Nov 2026); Your policies shows it only until something has migrated. */}
      {shown === 'sign-in' && !(running && !store.moveMinimized) && <MoveFinale origin="moved" />}
      <Tabs<PolicyKind> className="bx-tabs--line bpol__types" name="Policy types" value={shown} onChange={show} options={kinds} />
      {/* Each tab brings its own bar and list; a fragment, so they stay rows of
          the page grid as they were before the tabs. */}
      {shown === 'sign-in' ? (
        <div className="bpol__main">
          {/* Live and In review (owner, 12 Nov 2026: "segregate both types of policies inside the new policy"): a segment
              control over two lists. It appears once something has migrated; before that there is one list. */}
          {hasMoved && <Tabs<NewSub> className="bpol__sub" name="Policies by state" value={sub} onChange={setSub} options={isBuilt(experience) ? NEW_SUBS : NEW_SUBS_REVIEW} />}
          {hasMoved && sub === 'moved' && !isBuilt(experience) ? (
            !(running && !store.moveMinimized) && <MigrationResults />
          ) : (
            <>
              {/* The Review and Approve cards are the Under review list's own (owner, 12 Nov 2026). */}
              {hasMoved && sub === 'moved' && !(running && !store.moveMinimized) && <MoveFinale place="review" />}
              <SignInPolicies key={hasMoved ? sub : 'new'} origin={hasMoved ? sub : 'new'} />
            </>
          )}
        </div>
      ) : kind === 'old' ? (
        <OldPoliciesTab />
      ) : (
        <PostSignInPolicies />
      )}
    </div>
  )
}

/* The Sign-in tab: the page as it was before the tabs, reading sign-in
   policies only. A post sign-in policy is never in this table, its empty state
   or its count of policies deciding sign-ins (spec, Rulings: kept apart). */
/* A moved policy waits in Migrated policies while it is a draft; published, it is a policy like any made here and
   graduates to New policies (owner, 6 Nov 2026). */
const waitingMoved = (p: Policy) => !!p.movedFrom?.length && p.status === 'draft'

/* Two lists over one store (owner, 6 Nov 2026): 'new' is every policy made here, with Save draft and the rest; 'moved' is
   every policy that came over from the old console, kept as a review queue (view, approve, publish) so a tenant with
   fifty of them can do five a weekend and come back. */
function SignInPolicies({ origin, sectioned = false }: { origin: 'new' | 'moved' | 'all'; /** New policies in two sections: the migrated drafts to review, then the policies made here. */ sectioned?: boolean }) {
  const store = useBrand()
  /* Mark as template: one click, no dialog (owner, 18 Nov 2026). */
  const markTemplate = useSaveAsTemplate()
  const libView = POLICY_VIEW
  const [coverageOn, setCoverageOn] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [more, setMore] = useState<PolicyFilters>(NO_FILTERS)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modified', dir: 1 })
  /* The row dialogs. `dialog` keeps the policy while the dialog animates out,
     including after a delete has removed it from the store. */
  const [dialog, setDialog] = useState<RowDialog | null>(null)
  /* The policy whose details are in the slider (policy-details-drawer.tsx); kept while it slides out. */
  const [details, setDetails] = useState<{ id: string; open: boolean } | null>(null)
  /* Rows picked for an action on several at once (owner, 6 Nov 2026: "add checkboxes so the user can do things from
     outside as well"). Publish acts on the moved drafts among them. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const clearPicked = useCallback(() => setPicked(new Set()), [])
  /* The moved drafts a Publish press is about: the bulk bar's ticked ones, or one row's. */
  const [publishAsk, setPublishAsk] = useState<string[] | null>(null)
  /* Roll back a migrated policy (owner, 17 Nov 2026): the new one goes inactive, the old one decides again. */
  const [rollAsk, setRollAsk] = useState<Policy | null>(null)
  const togglePick = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const [dialogOpen, setDialogOpen] = useState(false)
  const openDialog = (kind: RowDialog['kind'], policy: Policy) => {
    setDialog({ kind, policy })
    setDialogOpen(true)
  }
  const closeDialog = () => setDialogOpen(false)

  /* New policy, the way a design tool makes a new file (owner, 23 Sep 2026:
     "by default it should open in draft mode with an untitled name — how Figma
     works, no need to ask questions").

     One click, and you are in the builder looking at a draft called "Untitled
     policy". Nothing is asked first, because nothing had to be: the name sits
     at the top of the builder under a pencil, and the applications are the
     start node at the head of the chain. The dialog asked for both, then showed
     you both again a frame later — and it asked before you had seen anything,
     which is the worst moment to name a thing.

     Numbered by `freeName` ("Untitled policy", "Untitled policy 2", …), because
     policies are told apart by name across the list, the status dialogs and the
     toasts, and two drafts called the same thing would be a rename nobody asked
     for. The builder already knows the name — applying a template to a policy
     still called "Untitled policy" renames it to the template's.

     No toast. It named a thing you are looking at.

     The draft is real from this moment: `blankPolicy` is `status: 'draft'`, it
     lands in the list, and it cannot go live until it has an application. An
     empty Untitled draft left behind is the same thing an empty Untitled file
     is — the owner's reference, and the row menu deletes it.

     Every edition, now. The full edition stopped for the naming form while the
     five-question guided build was offered from it; that build is retired for
     Describe it, which sits on the empty draft beside the templates (describe
     spec, §6.2). The naming form stays with the one caller that still needs a
     name first, the Applications screen's row. */
  /* SUPERSEDED 2 Nov 2026 (the team: no empty policies): it asks for a name and how to start first
     (create/NewPolicyDialog.tsx), and what it makes is kept only once saved with a rule (policy-draft.ts `newPolicy`). */
  const newOne = useNewPolicy()
  const startDraft = () =>
    newOne.ask({
      ways: true,
      onCreate: (name, start) => {
        const id = store.addPolicy(newPolicy(blankPolicy(name, []), start))
        store.go({ name: 'board', policyId: id })
      },
    })

  const showExposure = store.features.exposure

  /* Keyed on the collections it reads, not on the store object, so the deck
     recomputes only when a zone, fingerprint or group actually changes. */
  const { zones, fingerprints, groups, riskScale, users, methods, policies: tenantPolicies } = store
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => zones.find((z) => z.id === id)?.name ?? id,
      fingerprintName: (id) => fingerprints.find((p) => p.id === id)?.name ?? id,
      hasZone: (id) => zones.some((z) => z.id === id),
      hasFingerprint: (id) => fingerprints.some((p) => p.id === id),
      groupName: (id) => (groups.find((g) => g.id === id) ?? groups[0])?.name ?? id,
      riskScale,
      /* The tenant's own objects: zones and device profiles are read from their own entries, not from the chip table. */
      library: { zones, fingerprints, people: users, groups, methods, policies: tenantPolicies },
    }),
    [zones, fingerprints, groups, riskScale, users, methods, tenantPolicies],
  )

  /* Not run at all in Lite, where the Exposure column is withheld. The system
     default is skipped: it is the fall-through, so the deck would report it as
     nothing but holes. The deck asks app-access questions only. */
  const grades = useMemo(() => {
    const m = new Map<string, GauntletResult>()
    if (!showExposure) return m
    for (const p of store.policies) {
      if (p.isSystem || p.type !== 'App Access') continue
      m.set(p.id, runGauntlet(p, env, store.gauntletOverrides[p.id] ?? {}))
    }
    return m
  }, [showExposure, store.policies, store.gauntletOverrides, env])

  const q = query.trim().toLowerCase()
  /* One clock per render, so every row's "2 hours ago" is read against the same moment. */
  const now = Date.now()

  /* Sign-in policies only: the Post sign-in tab lists the rest. */
  const signIn = useMemo(
    () =>
      store.policies.filter(
        (p) => !isPostSignIn(p) && !store.held.includes(p.id) && (origin === 'all' ? true : origin === 'moved' ? waitingMoved(p) : !waitingMoved(p)),
      ),
    [store.policies, store.held, origin],
  )

  const rows = useMemo(() => {
    let list = signIn.filter((p) => {
      /* "Active" means what decides sign-ins, so the always-on default is in it
         and a monitoring policy, which decides none, is not. */
      if (status === 'active' && !enforces(p)) return false
      if ((status === 'draft' || status === 'monitor' || status === 'inactive') && p.status !== status) return false
      /* By the policy's name or by an application it covers (owner, 18 Nov 2026: "search by policy or application"). */
      if (q && !p.name.toLowerCase().includes(q) && !p.appIds.some((id) => store.apps.find((a) => a.id === id)?.name.toLowerCase().includes(q))) return false
      if (!policyMatches(p, more, { users: store.users, now: Date.now(), lastChanged: (x) => lastActivity(x, store.activity, Date.now())?.at })) return false
      return true
    })
    list = [...list].sort((a, b) => {
      const d = sort.dir
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * d
        case 'exposure': {
          const ra = grades.get(a.id)
          const rb = grades.get(b.id)
          // Ungraded (the system default) sorts to the bottom either way.
          if (!ra || !rb) return ra ? -1 : rb ? 1 : 0
          const byRank = exposureOf(rb).rank - exposureOf(ra).rank
          return (byRank !== 0 ? byRank : rb.breaches - ra.breaches) * d
        }
        /* Newest first on the first press. Nothing known sorts last either way. */
        case 'activity': {
          const ta = lastActivity(a, store.activity, Date.now())?.at
          const tb = lastActivity(b, store.activity, Date.now())?.at
          if (ta === undefined || tb === undefined) return ta !== undefined ? -1 : tb !== undefined ? 1 : 0
          return (tb - ta) * d
        }
        default:
          return 0
      }
    })
    // System policy is pinned regardless of sort — it always evaluates.
    return [...list.filter((p) => p.isSystem), ...list.filter((p) => !p.isSystem)]
  }, [signIn, status, q, sort, grades, store.activity, store.apps, store.users, more])

  const deciding = useMemo(() => signIn.filter(enforces).length, [signIn])

  /* Counted across everything graded, not just the filtered rows. */
  const leaking = [...grades.values()].filter((r) => r.breaches > 0).length

  const filtered = status !== 'all' || anySet(more)
  const systemPolicy = signIn.find((p) => p.isSystem)
  /* A tenant with nothing but the system policy: the list is empty in every
     sense that matters, though the pinned row is there. */
  /* Two tabs, empty (owner, 9 Nov 2026: "a dedicated banner for migration and an empty state for new policies"): the page
     is laid out as it is with policies, the migration banner on top and New policies' own empty state under it. */
  /* The phase 1 tester build (tester.ts) never shows Policies empty: the Global Default is a policy, so it is listed
     (owner, 18 Nov 2026: "policy can't be empty, showcase the Global only"). */
  const noPolicies = !TESTER && origin !== 'moved' && !q && !filtered && signIn.every((p) => p.isSystem)
  /* Two tabs: with nothing of its own, the one list starts at the migrate card, New policy beside Migrate. */
  const nothingMoved = origin === 'moved' && !q && !filtered && signIn.length === 0
  /* Old policies that can still move: with nothing moved yet, the empty state below is the one way in (owner, 9 Nov
     2026: "creating the migration twice doesn't make sense"), so the banner steps aside. */
  const canMove = store.legacy.policies.some((lp) => !store.movedLegacy[lp.id])
  /* Nothing of its own yet: the builder's own empty state takes the bar's and the table's place. */
  const hero = noPolicies
  /* The move is the Migrated policies tab's: its screen shows only there (owner, 9 Nov 2026). */
  const moving = origin !== 'new' && store.moveJob?.status === 'running'
  const pickable = rows.filter((p) => !p.isSystem)
  /* Two sections (owner, 10 Nov 2026: "segregate the existing policies and the migrated list"): the migrated drafts to
     review first, then the policies made here, system default included. With no drafts waiting there is one plain list. */
  const toReview = sectioned && origin === 'all' ? rows.filter(waitingMoved) : []
  const nextStep = rows.some((p) => !!p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
  const reviewFacts = useReviewFacts()
  const bulkExperience = useExperience()
  const pickedMoved = pickable.filter((p) => picked.has(p.id) && p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
  /* Today (owner, 17 Nov 2026): bulk Approve, and Publish only what is approved; Yesterday published any moved draft. */
  const pickedToApprove = pickedMoved.filter((p) => !store.moved[p.id]?.reviewed)
  const pickedDrafts = pickedMoved.filter((p) => !reviewFacts[p.id]?.rejected && (bulkExperience !== 'today' || !!store.moved[p.id]?.reviewed))

  const { setBody, searchRef, markLeaving } = useLeavingFocus(rows)

  const statusChange = useStatusChange({
    onAssignApps: (p) => openDialog('assign', p),
    onChange: (p) => markLeaving(p.id),
  })

  const act = (policy: Policy, action: RowAction) => {
    switch (action) {
      case 'edit':
        store.go({ name: 'board', policyId: policy.id })
        break
      /* The one testing item: the board's test mode on this policy (Version 3,
         the only version since 28 Sep 2026). */
      case 'test':
        store.go({ name: 'board', policyId: policy.id, open: 'try' })
        break
      case 'trail':
        store.go({ name: 'builder', policyId: policy.id })
        break
      case 'active':
      case 'monitor':
      case 'inactive':
        statusChange.request(policy, action)
        break
      case 'monitoring':
        statusChange.viewMonitoring(policy.id)
        break
      case 'duplicate': {
        const id = store.duplicatePolicy(policy.id)
        if (!id) return
        store.showToast(`${store.policyById(id)?.name ?? 'Copy'} created as a draft`)
        store.go({ name: 'board', policyId: id })
        break
      }
      /* One item, both ways: marked, it takes the policy off again (owner, 18 Nov 2026). */
      case 'template':
        if (markTemplate.marked(policy.id)) markTemplate.unmark(policy)
        else markTemplate.open(policy)
        break
      case 'delete':
      case 'assign':
      case 'text':
        openDialog(action, policy)
        break
    }
  }

  function head(key: SortKey, label: string, extra?: string) {
    return (
      <SortHead
        label={label}
        className={extra}
        on={sort.key === key}
        dir={sort.dir}
        onSort={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))}
      />
    )
  }

  const isCoverage = store.features.coverage && coverageOn

  /* No matches, or no policies at all — the same two states in every view. */
  const empty = (
    <>
      {rows.length === 0 && !nothingMoved && (
        <NoMatches
          noun="policies"
          query={query}
          filtered={filtered}
          compact
          onClear={() => {
            setStatus('all')
            setQuery('')
            setMore(NO_FILTERS)
          }}
        />
      )}
      {/* The page-level empty state every library page has (Zones, Device profiles): owner, 4 Nov 2026. */}
      {nothingMoved && canMove && <MigrateEmpty />}
      {nothingMoved && !canMove && origin === 'moved' && (
        <EmptyState
          icon={ShieldPlus}
          title="Nothing waiting to publish"
          blurb="Policies you publish move to New policies. The old ones stay in the Old policies tab."
        />
      )}
      {noPolicies && (
        <EmptyState
          icon={ShieldPlus}
          title="No policies yet"
          blurb={`Sign-ins use the ${systemPolicy?.name ?? 'default policy'} until you add a policy.`}
          action={
            <Button variant="brand" icon={Plus} onClick={startDraft}>
              New policy
            </Button>
          }
        />
      )}
    </>
  )

  /* The line under the list: how many decide sign-ins, and how many leak. */
  const summary = (
    <span>
      {deciding} {deciding === 1 ? 'policy' : 'policies'} deciding sign-ins
      {showExposure && leaking > 0 && (
        <>
          {', '}
          <button type="button" className="btable__leaking" onClick={() => setSort({ key: 'exposure', dir: 1 })}>
            {leaking} let test sign-ins through
          </button>
        </>
      )}
    </span>
  )

  /* One table, or two when New policies is in sections (owner, 10 Nov 2026: "the columns differ, not in a single table"):
     the migrated drafts carry From and Next step; the policies made here carry Last activity. */
  const renderTable = (list: Policy[], kind: 'all' | 'review' | 'mine') => {
    const review = kind === 'review'
    const next = review || (kind === 'all' && nextStep)
    const pick = list.filter((p) => !p.isSystem)
    return (
      <section className="btable__section" key={kind}>
        {kind !== 'all' && (
          <h3 className="btable__sectionhead">
            {review ? 'Migrated, to review' : 'Your policies'}
            <span>{review ? 'From your old policies. Open each, approve it, then publish.' : 'Made in the new builder.'}</span>
          </h3>
        )}
        <div className="btable__scroll">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col" className="btable__col-pick">
                  <input
                    type="checkbox"
                    className="bpol__pick"
                    aria-label={review ? 'Select every migrated policy' : 'Select every policy'}
                    checked={pick.length > 0 && pick.every((p) => picked.has(p.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = pick.some((p) => picked.has(p.id)) && !pick.every((p) => picked.has(p.id))
                    }}
                    onChange={(e) =>
                      setPicked((cur) => {
                        const n = new Set(cur)
                        pick.forEach((p) => (e.target.checked ? n.add(p.id) : n.delete(p.id)))
                        return n
                      })
                    }
                  />
                </th>
                {head('name', 'Policy name')}
                <th scope="col">Applications</th>
                {showExposure && !review && head('exposure', 'Exposure')}
                {review ? (
                  <th scope="col" className="btable__col-activity">
                    From
                  </th>
                ) : (
                  head('activity', 'Last activity', 'btable__col-activity')
                )}
                <th scope="col" className="btable__col-status">
                  Status
                </th>
                {next && (
                  <th scope="col" className="btable__col-next">
                    Next step
                  </th>
                )}
                <th scope="col" className="btable__actions btable__col-actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody ref={kind === 'mine' ? undefined : setBody}>
              {list.map((p) => (
                <PolicyRow
                  key={p.id}
                  policy={p}
                  gauntlet={grades.get(p.id)}
                  showExposure={showExposure && !review}
                  activity={review ? `${p.movedFrom?.length ?? 0} old ${p.movedFrom?.length === 1 ? 'policy' : 'policies'}` : activityLabel(lastActivity(p, store.activity, now), now)}
                  monitor={monitorOffered(store.features)}
                  trySignIn={store.features.trySignIn}
                  onOpen={() => (p.movedFrom?.length ? store.go({ name: 'board', policyId: p.id }) : setDetails({ id: p.id, open: true }))}
                  onAction={(a) => act(p, a)}
                  onPublish={() => setPublishAsk([p.id])}
                  onRollBack={() => setRollAsk(p)}
                  nextStep={next}
                  picked={picked.has(p.id)}
                  onPick={p.isSystem ? undefined : () => togglePick(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  /* The dialog's policy as it is now, or as it was when it was deleted. */
  const current = dialog ? (store.policies.find((p) => p.id === dialog.policy.id) ?? dialog.policy) : null

  return (
    <>
      {/* The migration's banner, whatever stage it is at; then, with nothing here yet, the builder's own empty state
          in place of the bar and the table (owner, 4 Nov 2026: two separate things). */}
      <FirstVisit />
      {moving && !store.moveMinimized ? (
        /* While a move runs the whole page is the move (owner, 5 Nov 2026). */
        <MovingShowcase />
      ) : (
      <>
      {!(nothingMoved && canMove) && <MoveNote />}
      {/* Nothing migrated yet: the migrate card alone, no search, filter or table around it (owner, 9 Nov 2026). */}
      {(hero || (nothingMoved && canMove)) && empty}
      {!hero && !(nothingMoved && canMove) && (
      <>
      {/* The row every list page has — see `PageBar`: the search box, then the
          filter; the view and New on the right. Coverage has no rows to search
          or filter. */}
      <PageBar
        left={
          !isCoverage && (
            <>
              <SearchBox
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                placeholder="Search policies or applications…"
                label="Search policies"
              />
              <span className={`btoolbar__filter bbar__filter ${status !== 'all' ? 'is-set' : ''}`}>
                <Picker
                  label="Filter by status"
                  size="md"
                  icon={ListFilter}
                  prefix="Status"
                  value={status}
                  options={STATUS_TABS}
                  onChange={(v) => setStatus(v as StatusFilter)}
                />
              </span>
              <MoreFilters value={more} onChange={setMore} apps={store.apps} users={store.users} groups={store.groups} />
            </>
          )
        }
        right={
          <>
            {/* No table/list/card switch — the table is the only view. The switch
                is drawn only where there is a second thing to switch to. */}
            {store.features.coverage && (
              <ViewSwitch<PolicyView>
                value={isCoverage ? 'coverage' : 'table'}
                views={POLICY_VIEWS}
                label="Policy view"
                onChange={(v) => setCoverageOn(v === 'coverage')}
              />
            )}
            {/* The tenant's Access checks page opens from here, not the rail
                (owner, 30 Sep 2026: "move Sign-in tests inside the All Policies
                tab, as a button"; 1 Oct: named for access, names.ts). Secondary,
                before New policy, so the bar keeps one orange button; withheld
                exactly as the route is. */}
            {/* Sign-in activity beside it (owner, 5 Oct 2026: "move the sign-in activities in the main policy screen with the
                check access button"): the week's sign-ins and why any were refused. */}
            {/* None of the three in Under review (owner, 12 Nov 2026: "can remove"): that list is for reviewing, not for testing. */}
            {origin !== 'moved' && DENIAL_REASONS && screenOffered({ name: 'sign-in-tests' }, store.features) && (
              <Button variant="secondary" icon={ListChecks} onClick={() => store.go({ name: 'sign-in-activity' })}>
                Sign-in activity
              </Button>
            )}
            {origin !== 'moved' && screenOffered({ name: 'sign-in-tests' }, store.features) && (
              <Button variant="secondary" icon={LogIn} onClick={() => store.go({ name: 'sign-in-tests' })}>
                {ACCESS_CHECK}
              </Button>
            )}
            {origin !== 'moved' && (
              <Button variant="brand" icon={Plus} onClick={startDraft}>
                New policy
              </Button>
            )}
          </>
        }
      />

      {isCoverage && <Coverage onNew={startDraft} />}

      {/* The global selection bar (bulk-bar.tsx, owner 9 Nov 2026): floats at the foot of the window. */}
      <BulkBar
        count={!isCoverage && libView === 'table' ? picked.size : 0}
        label="Selected policies"
        onClear={clearPicked}
        actions={[
          ...(bulkExperience === 'today'
            ? [
                {
                  label: 'Approve',
                  icon: Check,
                  disabledReason: pickedToApprove.length === 0 ? 'Nothing selected is waiting for approval' : undefined,
                  onClick: () => {
                    const ids = pickedToApprove.map((p) => p.id)
                    ids.forEach((id) => {
                      store.reviewMoved(id, true)
                      clearRejected(id)
                    })
                    store.showToast(ids.length === 1 ? '1 policy approved' : `${ids.length} policies approved`, { label: 'Undo', run: () => ids.forEach((id) => store.reviewMoved(id, false)) })
                  },
                },
              ]
            : []),
          {
            label: 'Publish',
            icon: Rocket,
            disabledReason: pickedDrafts.length === 0 ? (bulkExperience === 'today' ? 'Approve them first' : 'Only moved drafts can be published') : undefined,
            onClick: () => setPublishAsk(pickedDrafts.map((p) => p.id)),
          },
        ]}
      />
      <PublishMovedConfirm
        ids={publishAsk}
        onClose={() => setPublishAsk(null)}
        onDone={() => setPicked(new Set())}
      />
      <Confirm
        open={!!rollAsk}
        onClose={() => setRollAsk(null)}
        destructive={false}
        title={`Roll back ${rollAsk?.name ?? ''}?`}
        confirmLabel="Roll back"
        confirmIcon={Undo2}
        onConfirm={() => {
          const p = rollAsk
          setRollAsk(null)
          if (!p) return
          store.setPolicyStatus(p.id, 'inactive')
          markRolledBack(p.id, true)
          store.showToast(`${p.name} rolled back. The old policy decides again.`)
        }}
      >
        The old policy decides sign-ins for its applications again. This policy becomes inactive and stays here to fix. Nothing is deleted.
      </Confirm>
      {!isCoverage && libView === 'table' && (
        <div className="btable-wrap">
          {rows.length > 0 && (sectioned && origin === 'all' && toReview.length > 0 ? (
            <>
              {renderTable(toReview, 'review')}
              {rows.length > toReview.length && renderTable(rows.filter((p) => !waitingMoved(p)), 'mine')}
            </>
          ) : (
            renderTable(rows, 'all')
          ))}
          {empty}
          <footer className="btable__foot">{summary}</footer>
        </div>
      )}

      {/* List and card: the libraries' own two shapes, drawn by the component
          Zones, Device profiles and Risk signal profiles use. The table stays
          the policies' own — it sorts, and it grades. */}
      {!isCoverage && libView !== 'table' && (
        <>
          {rows.length > 0 && (
            <LibraryRows
              view={libView}
              listRef={setBody}
              columns={[]}
              rows={rows.map(
                (p): LibRow => ({
                  id: p.id,
                  name: p.name,
                  tile: <ShieldCheck size={18} strokeWidth={1.8} />,
                  tileClass: 'bpol__tile',
                  badge: <PolicyMarks policy={p} />,
                  onOpen: () => setDetails({ id: p.id, open: true }),
                  facts: [
                    { label: 'Apps', value: <PolicyApps policy={p} onAssign={() => act(p, 'assign')} /> },
                    { label: 'Status', value: <span className="btable__marks"><PolicyStatus policy={p} /></span> },
                    { label: 'Last activity', value: activityLabel(lastActivity(p, store.activity, now), now) },
                    ...(showExposure
                      ? [{ label: 'Exposure', value: <PolicyExposure policy={p} gauntlet={grades.get(p.id)} /> }]
                      : []),
                  ],
                  menu: (
                    <RowMenu
                      label={`Actions for ${p.name}`}
                      items={policyMenu(p, { monitor: monitorOffered(store.features), trySignIn: store.features.trySignIn, marked: markTemplate.marked(p.id) })}
                      onSelect={(id) => act(p, id as RowAction)}
                    />
                  ),
                }),
              )}
            />
          )}
          {empty}
          <p className="bpol__foot">{summary}</p>
        </>
      )}
      </>
      )}
      </>
      )}

      {/* The row dialogs, on the page so they outlive the row. */}
      {dialog && current && dialog.kind === 'delete' && (
        <ConfirmDelete
          open={dialogOpen}
          name={current.name}
          noun="policy"
          requireTyped
          detail={deleteLine(deleteFacts(current, store.policies, store.apps, store.users, store.groups))}
          onCancel={closeDialog}
          onConfirm={() => {
            markLeaving(current.id)
            closeDialog()
            store.deletePolicy(current.id)
            store.showToast(`${current.name} deleted`)
          }}
        />
      )}
      {dialog && current && dialog.kind === 'assign' && (
        <AssignAppsDialog
          open={dialogOpen}
          policy={current}
          onClose={closeDialog}
          onCommit={() => markLeaving(current.id)}
        />
      )}
      {/* Read as text: the whole policy as numbered sentences, in a drawer —
          the list has no chain to point at (describe spec, §7.2). */}
      {dialog && current && dialog.kind === 'text' && (
        <ReadAsTextDrawer key={current.id} open={dialogOpen} policy={current} onClose={closeDialog} />
      )}
      {statusChange.dialog}
      {newOne.dialog}
      {details && store.policies.some((p) => p.id === details.id) && (
        <PolicyDetailsDrawer open={details.open} policyId={details.id} onClose={() => setDetails({ ...details, open: false })} />
      )}
    </>
  )
}

/* --- The Post sign-in tab -------------------------------------------------------

   Post sign-in policies (post-sign-in.ts): name, applications, status and the
   row menu, with a search and a status filter, as the Sign-in tab has. Less
   than that tab on purpose:
   - No Monitoring, in the filter or the menu: these have Draft, Active and
     Inactive only (owner, 13 Oct 2026). `statusOptions` already leaves Monitor
     out for anything but an app access policy.
   - No Sign-in activity or Check access in the bar: those test and explain
     sign-ins, and these are never part of one.
   - No details slider: the name opens the board, the one builder for both
     types (owner, 13 Oct 2026: "I don't want to add a new builder until
     needed"), where the policy is its rules, its "Nothing else matched" and
     the applications linked to it, read only.
   - No Assign apps: an application is linked, with its events, from its own
     page (spec, Rulings), so the Applications cell only lists them.
   - No Exposure, Coverage, Read as text or Save as template: each reads a
     sign-in decision, and a post sign-in rule's Then is an action on an
     event. No Duplicate: a copy would hold its applications' events too, and
     an event is decided by one policy at most. */

type PostStatusFilter = 'all' | 'active' | 'draft' | 'inactive'
type PostSortKey = 'name' | 'modified'

const POST_STATUS: { value: PostStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
]

type PostRowAction = 'edit' | 'active' | 'inactive' | 'delete'

/* Edit policy, the switch its status allows, then Delete — the Sign-in tab's
   marks and order, with only the items that apply to this type. */
function postSignInMenu(policy: Policy): MenuItem[] {
  return [
    { id: 'edit', label: 'Edit policy', icon: ROW_ICON.edit },
    ...statusOptions(policy, { monitor: false }).map((s) => ({ id: s.target, label: s.label, icon: ROW_ICON[s.target] })),
    { id: 'delete', label: 'Delete policy', icon: ROW_ICON.delete, danger: true, divide: true },
  ]
}

/* What the delete confirmation adds about a post sign-in policy: where it is
   acting, while it is. `deleteDetail` speaks of protecting sign-ins, which
   this type never does. The applications with their logos, as the sign-in
   delete names its own (owner, 23 Oct 2026: logos beside application names). */
function postDeleteDetail(policy: Policy, apps: readonly { id: string; name: string }[]): ReactNode {
  if (policy.status !== 'active') return undefined
  const named = apps.filter((a) => policy.appIds.includes(a.id))
  return named.length > 0 ? (
    <>
      Acts on events in <AppFacts apps={named} />.
    </>
  ) : undefined
}

/* The sign-in delete's line about its applications, drawn with their logos (app-facts.tsx), or nothing to add. */
const deleteLine = (facts: ReturnType<typeof deleteFacts>): ReactNode => (facts ? <DeleteFactsLine facts={facts} /> : undefined)

function PostSignInPolicies() {
  const store = useBrand()
  const [status, setStatus] = useState<PostStatusFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: PostSortKey; dir: 1 | -1 }>({ key: 'modified', dir: 1 })
  /* Kept while the confirmation animates out, including after the delete. */
  const [deleting, setDeleting] = useState<Policy | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const all = useMemo(() => store.policies.filter(isPostSignIn), [store.policies])
  const q = query.trim().toLowerCase()
  const filtered = status !== 'all'

  /* "Modified" is the store's own order, newest first; only the name sorts. */
  const rows = useMemo(() => {
    const list = all.filter((p) => (!filtered || p.status === status) && (!q || p.name.toLowerCase().includes(q)))
    return sort.key === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name) * sort.dir) : list
  }, [all, filtered, status, q, sort])

  const live = useMemo(() => all.filter((p) => p.status === 'active').length, [all])

  const { setBody, searchRef, markLeaving } = useLeavingFocus(rows)
  const statusChange = useStatusChange({ onChange: (p) => markLeaving(p.id) })

  const openBuilder = (p: Policy) => store.go({ name: 'board', policyId: p.id })

  /* New policy of this tab's type, linked to nothing: a name first, the Sign-in tab's way (2 Nov 2026). A post sign-in
     policy has no other way to start yet, so the name is all it asks. */
  const newOne = useNewPolicy()
  const startDraft = () =>
    newOne.ask({
      onCreate: (name) => {
        const id = store.addPolicy(newPolicy(blankPostSignInPolicy(name)))
        store.go({ name: 'board', policyId: id })
      },
    })

  const act = (policy: Policy, action: PostRowAction) => {
    switch (action) {
      case 'edit':
        openBuilder(policy)
        break
      /* The switches every policy uses (use-status-change.tsx). Turn on is
         offered on a draft too, and refused there in a toast that says what
         is left, until every rule and "Nothing else matched" have an action
         (`turnOnIssue`). */
      case 'active':
      case 'inactive':
        statusChange.request(policy, action)
        break
      case 'delete':
        setDeleting(policy)
        setDeleteOpen(true)
        break
    }
  }

  const current = deleting ? (store.policies.find((p) => p.id === deleting.id) ?? deleting) : null

  return (
    <>
      {/* New policy alone on the right: Sign-in activity and Check access are
          the Sign-in tab's, as they explain and test sign-ins. */}
      <PageBar
        left={
          <>
            <SearchBox value={query} onChange={setQuery} inputRef={searchRef} placeholder="Search policies…" label="Search policies" />
            <span className={`btoolbar__filter bbar__filter ${filtered ? 'is-set' : ''}`}>
              <Picker
                label="Filter by status"
                size="md"
                icon={ListFilter}
                prefix="Status"
                value={status}
                options={POST_STATUS}
                onChange={(v) => setStatus(v as PostStatusFilter)}
              />
            </span>
          </>
        }
        right={
          <Button variant="brand" icon={Plus} onClick={startDraft}>
            New policy
          </Button>
        }
      />

      <div className="btable-wrap">
        {rows.length > 0 && (
          <div className="btable__scroll">
            <table className="btable">
              <thead>
                <tr>
                  <SortHead
                    label="Policy name"
                    on={sort.key === 'name'}
                    dir={sort.dir}
                    onSort={() => setSort((s) => ({ key: 'name', dir: s.key === 'name' && s.dir === 1 ? -1 : 1 }))}
                  />
                  <th scope="col">Applications</th>
                  <th scope="col" className="btable__col-status">
                    Status
                  </th>
                  <th scope="col" className="btable__actions btable__col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody ref={setBody}>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="btable__primary">
                        <span className="blist__tile bpol__tile" aria-hidden>
                          <ShieldCheck size={18} strokeWidth={1.8} />
                        </span>
                        <button type="button" className="btable__link" onClick={() => openBuilder(p)}>
                          {p.name}
                        </button>
                      </div>
                    </td>
                    <td>
                      <LinkedApps policy={p} />
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td className="btable__actions">
                      <RowMenu label={`Actions for ${p.name}`} items={postSignInMenu(p)} onSelect={(id) => act(p, id as PostRowAction)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {all.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldPlus}
            title="No post sign-in policies yet"
            action={
              <Button variant="secondary" icon={Plus} onClick={startDraft}>
                New policy
              </Button>
            }
          />
        ) : (
          rows.length === 0 && (
            <NoMatches
              noun="policies"
              query={query}
              filtered={filtered}
              compact
              onClear={() => {
                setStatus('all')
                setQuery('')
              }}
            />
          )
        )}
        {all.length > 0 && (
          <footer className="btable__foot">
            {live} {live === 1 ? 'policy' : 'policies'} acting after sign-in
          </footer>
        )}
      </div>

      {current && (
        <ConfirmDelete
          open={deleteOpen}
          name={current.name}
          noun="policy"
          requireTyped
          detail={postDeleteDetail(current, store.apps)}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            markLeaving(current.id)
            setDeleteOpen(false)
            store.deletePolicy(current.id)
            store.showToast(`${current.name} deleted`)
          }}
        />
      )}
      {statusChange.dialog}
      {newOne.dialog}
    </>
  )
}

/* --- Shared by both tabs ------------------------------------------------------- */

/* `scope` and `aria-sort` are what a sortable header owes a screen reader. */
function SortHead({
  label,
  on,
  dir,
  onSort,
  className,
}: {
  label: string
  on: boolean
  dir: 1 | -1
  onSort: () => void
  className?: string
}) {
  return (
    <th className={className} scope="col" aria-sort={on ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`btable__sort ${on ? 'is-on' : ''}`} onClick={onSort}>
        {label}
        <span aria-hidden>{on ? (dir === 1 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

/* Focus after a change that removed a row: the row now in its place (or the
   one above, at the end), or the search box when the list is empty. Runs
   after the closing dialog has tried to restore focus to the gone row.
   `markLeaving` names the row a confirmed change may remove from the list —
   a delete, a status change under a status filter, an assignment that makes
   it a draft — just before it is written. */
function useLeavingFocus(rows: readonly Policy[]) {
  /* The rows' container in whichever view is showing, for the focus pass. */
  const bodyRef = useRef<HTMLElement | null>(null)
  const setBody = useCallback((el: HTMLElement | null) => {
    bodyRef.current = el
  }, [])
  const searchRef = useRef<HTMLInputElement | null>(null)
  const leaving = useRef<{ id: string; index: number } | null>(null)

  const markLeaving = (id: string) => {
    leaving.current = { id, index: rows.findIndex((r) => r.id === id) }
  }

  useEffect(() => {
    const l = leaving.current
    if (!l) return
    leaving.current = null
    if (rows.some((r) => r.id === l.id)) return
    const links = bodyRef.current?.querySelectorAll<HTMLButtonElement>('.btable__link, .blist__open')
    const next = links && links.length > 0 ? links[Math.min(Math.max(l.index, 0), links.length - 1)] : null
    ;(next ?? searchRef.current)?.focus({ preventScroll: true })
  }, [rows])

  return { setBody, searchRef, markLeaving }
}

/* The mark for each item. Radar for Monitor (owner, 25 Sep 2026), leaving Eye
   to mean viewing what a monitoring policy saw. AlignLeft for Read as text,
   the board bar's own mark for it. CopyPlus for Duplicate, the
   glyph the policy builder's rule menu uses (owner, 23 Sep 2026: "use the one
   we use inside the policy builder"): two sheets alone read as "copy to the
   clipboard"; the plus says a second one is made. */
const ROW_ICON: Record<RowMenuId, LucideIcon> = {
  edit: Pencil,
  test: LogIn,
  active: Power,
  monitor: Radar,
  inactive: PowerOff,
  monitoring: Eye,
  trail: Waypoints,
  text: AlignLeft,
  template: TemplateIcon,
  duplicate: CopyPlus,
  delete: Trash2,
}

/* A policy's row menu, the same in every view: the items and their order are
   `rowMenu`'s, where a test pins them. Try a sign-in is the one testing item,
   directly under Edit policy (final spec, E3); the older trail builder is not
   in the showcase build, where the board is the one builder (see showcase.ts). */
function policyMenu(policy: Policy, { monitor, trySignIn, marked = false }: { monitor: boolean; trySignIn: boolean; marked?: boolean }): MenuItem[] {
  return rowMenu(policy, { monitor, trySignIn, trail: !SHOWCASE, marked }).map((item) => ({
    ...item,
    icon: ROW_ICON[item.id],
    ...(item.id === 'delete' ? { danger: true, divide: true } : {}),
  }))
}

/* A migrated draft's menu (owner, 17 Nov 2026): it is in review, so only review actions. No edit, read as text,
   template, duplicate or delete. Contact support is on the migration card only (18 Nov 2026). */
function reviewMenu(review: 'review' | 'approved' | 'rejected'): MenuItem[] {
  return [
    { id: 'review', label: 'Review', icon: Eye },
    ...(TESTER ? [] : [{ id: 'test', label: 'Check access', icon: LogIn }]),
    ...(review === 'approved' ? [{ id: 'unapprove', label: 'Take back approval', icon: Undo2, divide: true }] : [{ id: 'approve', label: 'Approve', icon: Check, divide: true }]),
    ...(review === 'rejected' ? [] : [{ id: 'reject', label: 'Reject', icon: X }]),
  ]
}

/* The applications, as marks with the full list on hover; with none, the
   control that assigns them. The table's cell and the list's and card's fact. */
function PolicyApps({ policy, onAssign }: { policy: Policy; onAssign: () => void }) {
  const store = useBrand()
  const named = appsOf(policy, store.apps)
  if (policy.isSystem) return <span className="btable__allapps">Every application</span>
  if (named.length > 0) return <AppsPeek apps={named} policyName={policy.name} onEdit={onAssign} />
  return (
    <button type="button" className="btable__assign" onClick={onAssign}>
      <Plus size={13} strokeWidth={2.2} aria-hidden />
      Assign apps
    </button>
  )
}

/* A post sign-in policy's applications: the ones linked to it, through
   `appIds`, which mirrors its links (post-sign-in.ts). Read only. Each is
   linked, with its events, from the application's own page, so the panel has
   no Edit and the empty cell no Assign apps. */
function LinkedApps({ policy }: { policy: Policy }) {
  const store = useBrand()
  const named = appsOf(policy, store.apps)
  if (named.length > 0) return <AppsPeek apps={named} policyName={policy.name} />
  return <span className="u-muted">Not linked</span>
}

/* How exposed a policy is, as a grade that opens its Break-in test. */
function PolicyExposure({ policy, gauntlet }: { policy: Policy; gauntlet?: GauntletResult }) {
  const store = useBrand()
  if (!gauntlet) {
    return (
      <span
        className="u-muted"
        title={policy.isSystem ? 'The default policy catches every sign-in, so it is not scored.' : 'Only app access policies are scored.'}
      >
        —
      </span>
    )
  }
  const e = exposureOf(gauntlet)
  return (
    <button
      type="button"
      className={`btable__exposure is-${e.tone}`}
      title={gauntlet.gradeReason}
      onClick={() => {
        store.go({ name: 'board', policyId: policy.id, open: 'break-in' })
      }}
    >
      {e.label}
      <b>{gauntlet.grade}</b>
    </button>
  )
}

/* Move policies' way in (migrate/MovePolicies.tsx): while the old console still holds sign-in policies that have not
   moved, or moved ones are still drafts. Gone once every one is moved and turned on. A secondary button: the
   page's orange is New policy. */
function MoveNote() {
  const store = useBrand()
  /* Only rows that CAN move: one whose application already has a policy here waits on nothing the admin can do. */
  const ctx = { apps: store.moveApps, groups: store.groups, users: store.users, zones: store.zones, policies: store.policies, staged: store.staged }
  const waiting = store.legacy.policies.filter((lp) => !store.movedLegacy[lp.id] && !blockedReason(lp, ctx)).length
  const job = store.moveJob
  const toReview = Object.values(store.moved).filter((m) => !m.approved).length
  /* Review opens as a popup over this page (owner, 5 Nov 2026); while the move runs the banner has no button. */
  const open = () => store.openReview()
  /* Start migration opens the Migrate popup straight away (owner, 9 Nov 2026); the intro stays on See what's new. */
  const start = () => store.openMoveDialog()
  /* A move under way, or done and waiting for review: what is happening, and View details into it. Nothing it made is
     in this list until it is approved (owner, 4 Nov 2026). */
  /* While it runs, folded: a slim bar with Expand (owner, 5 Nov 2026). */
  if (job?.status === 'running') return <MovingBar />
  /* Approved ones waiting to be added, or rows landing: the finale's banner says it, alone. */
  if (store.held.length > 0 || store.landing.length > 0 || store.activating) return null
  if (toReview > 0)
    return <MoveBanner where="new" waiting={waiting} secondary progress={{ done: job?.done ?? 0, total: job?.total ?? 0, running: false, toReview }} onAction={open} />
  /* Just approved: the finale banner (migrate/finale.tsx) takes it from here. */
  /* Old policies still waiting: the same quiet banner as the empty page, its button a secondary because New policy is
     this list's orange. */
  if (waiting > 0) return <MoveBanner where="new" waiting={waiting} secondary onAction={start} />
  return null
}

/* The marks beside a policy's name: System, and a live policy's unpublished edits. */
/* The template mark beside a policy's name (owner, 18 Nov 2026: "show this icon while hover on the row"). A star that
   toggles in place, the way a mail list stars a message: on a marked policy it stays, filled; on any other policy that
   could be a template it shows while the row is hovered or the star has focus, outline, and a press marks it. Pressed
   again it takes the policy off, with Undo in the toast. The row's ⋯ says the same thing in words. */
function TemplateMark({ policy }: { policy: Policy }) {
  const marked = useMarkedAsTemplate(policy.id)
  const mark = useSaveAsTemplate()
  /* A migrated draft is in review, and its menu has no template item (owner, 17 Nov 2026), so no star either. */
  if (!marked && (!canSaveAsTemplate(policy) || waitingMoved(policy))) return null
  const label = marked ? UNMARK_LABEL : MARK_LABEL
  return (
    <Tip text={marked ? 'Marked as template' : label}>
      <button
        type="button"
        className={`bpol__template-mark${marked ? ' is-on' : ''}`}
        aria-label={label}
        aria-pressed={marked}
        onClick={() => (marked ? mark.unmark(policy) : mark.open(policy))}
      >
        <TemplateIcon size={14} strokeWidth={1.9} fill={marked ? 'currentColor' : 'none'} aria-hidden />
      </button>
    </Tip>
  )
}

function PolicyMarks({ policy }: { policy: Policy }) {
  /* "From old policy" is gone, and Approved moved to the Status column (owner, 10 Nov 2026). */
  /* Published, it graduates to New policies and keeps a tag saying where it came from (owner, 10 Nov 2026). */
  return (
    <span className="btable__marks">
      <TemplateMark policy={policy} />
      {policy.isSystem && <Badge tone="system">System</Badge>}
      {policy.pendingDraft && <ChangeState unsaved={false} draft />}
    </span>
  )
}

function PolicyRow({
  policy,
  gauntlet,
  showExposure,
  activity,
  monitor,
  trySignIn,
  onOpen,
  onAction,
  picked = false,
  onPick,
  onPublish,
  onRollBack,
  nextStep = false,
}: {
  policy: Policy
  /** The Next step column is drawn: this row's cell is its Publish, or empty. */
  nextStep?: boolean
  /** A moved draft's quick Publish, beside the row menu (owner, 6 Nov 2026). */
  onPublish?: () => void
  /** A migrated, active policy's Roll back (owner, 17 Nov 2026): the old policy decides again. */
  onRollBack?: () => void
  picked?: boolean
  /** Ticks the row for an action on several at once; absent on the system policy. */
  onPick?: () => void
  gauntlet?: GauntletResult
  showExposure: boolean
  /** "Edited 2 hours ago": the last thing that happened to it (policy-activity.ts). */
  activity: string
  /** The name's press: its details, in the slider. */
  onOpen: () => void
  /** The edition has the Monitoring status, so the menu offers Monitor. */
  monitor: boolean
  /** The edition has Try a sign-in, so the menu offers it. */
  trySignIn: boolean
  onAction: (action: RowAction) => void
}) {
  /* Arriving from a move: each row lights in turn, by its place in the move (move-policies.css `.is-arrived`). */
  const { imported, landing, moved: movedInfo, showToast, reviewMoved } = useBrand()
  const [rejecting, setRejecting] = useState(false)
  const liveFacts = useReviewFacts()
  /* Yesterday's version (kept for comparison): Draft plus Approved, the full menu, Publish on every draft. */
  const old = useExperience() === 'yesterday'
  const facts = old ? ({} as typeof liveFacts) : liveFacts
  const migrated = !old && !!policy.movedFrom?.length
  /* A migrated draft is in review, not a draft (owner, 17 Nov 2026): Under review, Approved or Rejected. */
  const review = migrated && policy.status === 'draft' ? (facts[policy.id]?.rejected ? 'rejected' : movedInfo[policy.id]?.reviewed ? 'approved' : 'review') : null
  const at = imported.indexOf(policy.id)
  const publishable = !!policy.movedFrom?.length && policy.status === 'draft' && policy.appIds.length > 0
  /* Laid in by Add to Policies, or just made active: one light sweep (finale.css). */
  const lands = landing.includes(policy.id)
  const asTemplate = useMarkedAsTemplate(policy.id)
  return (
    <tr data-from-old={policy.movedFrom ? 'true' : undefined} className={`${policy.isSystem ? 'is-system' : ''}${at >= 0 && !lands ? ' is-arrived' : ''}${lands ? ' is-landing' : ''}`} style={at >= 0 ? { ['--arrive' as string]: Math.min(at, 12) } : undefined}>
      {/* The row's layout lives on a wrapper INSIDE the cell. `.btable__primary`
          is a flex row, and set on the `<td>` itself it stopped the cell being
          a table cell: it sized to its own content instead of the row, so its
          bottom rule sat 5px above every other column's on each row. */}
      <td className="btable__col-pick">
        {onPick && <input type="checkbox" className="bpol__pick" aria-label={`Select ${policy.name}`} checked={picked} onChange={onPick} />}
      </td>
      <td>
        <div className="btable__primary">
          {/* The mark the list and card views give a policy, so a row reads as
              the same object in all three. */}
          <span className="blist__tile bpol__tile" aria-hidden>
            <ShieldCheck size={18} strokeWidth={1.8} />
          </span>
          <button type="button" className="btable__link" onClick={onOpen}>
            {policy.name}
          </button>
          <PolicyMarks policy={policy} />
          {/* Migrated or made here: the two act differently (Roll back), so the list says which (owner, 17 Nov 2026). */}
          {migrated && !review && <Badge tone="neutral">Migrated</Badge>}
        </div>
      </td>
      <td>
        <PolicyApps policy={policy} onAssign={() => onAction('assign')} />
      </td>
      {showExposure && (
        <td>
          <PolicyExposure policy={policy} gauntlet={gauntlet} />
        </td>
      )}
      <td className="btable__activity">{activity}</td>
      <td>
        <span className="btable__marks">
          <PolicyStatus policy={policy} />
        </span>
      </td>
      {nextStep && (
        <td className="btable__next">
          {/* Rejected cannot be published until it is approved again inside (owner, 17 Nov 2026); Contact support lives
              on the migration card only, never on the row (owner, 18 Nov 2026). */}
          {review === 'rejected' ? (
            /* What happens next, in words (owner, 18 Nov 2026): support is on the Reject card above the list. */
            <span className="btable__hint">Contact support from the Reject card</span>
          ) : review === 'review' ? (
            /* Not reviewed yet: Review first; Publish comes once it is approved (owner, 17 Nov 2026). */
            <Button variant="secondary" size="sm" icon={Eye} onClick={onOpen}>
              Review
            </Button>
          ) : (
            publishable &&
            onPublish && (
              <Button variant="secondary" size="sm" icon={Rocket} onClick={onPublish}>
                Publish
              </Button>
            )
          )}
        </td>
      )}
      <td className="btable__actions">
        <RowMenu
          label={`Actions for ${policy.name}`}
          items={review ? reviewMenu(review) : [
            ...policyMenu(policy, { monitor, trySignIn, marked: asTemplate }),
            ...(migrated && policy.status === 'active' && onRollBack ? [{ id: 'rollback', label: 'Roll back to old policy', icon: Undo2, divide: true }] : []),
            /* A migrated policy once live or rolled back (owner, 18 Nov 2026): help from miniOrange. Drafts in review reach
               support from the migration card only. */
            ...(migrated ? [{ id: 'support', label: 'Contact support', icon: Headset, divide: !(policy.status === 'active' && onRollBack) }] : []),
          ]}
          onSelect={(id) => {
            if (id === 'rollback') return onRollBack?.()
            if (id === 'support') return showToast('Contact support: this flow is planned next')
            if (id === 'review') return onOpen()
            if (id === 'approve') {
              reviewMoved(policy.id, true)
              clearRejected(policy.id)
              return showToast(`${policy.name} approved`, { label: 'Undo', run: () => reviewMoved(policy.id, false) })
            }
            if (id === 'unapprove') return reviewMoved(policy.id, false)
            if (id === 'reject') return setRejecting(true)
            onAction(id as RowAction)
          }}
        />
        <RejectDialog policy={rejecting ? policy : null} variant="today" onClose={() => setRejecting(false)} />
      </td>
    </tr>
  )
}

/* --- Assigning applications from the list ---------------------------------------

   Opens from the Applications cell. A checklist, not a picker: the dialog is the
   question, so every application is visible without a second layer. It edits a
   local set and saves on Save, because assigning applications changes what is
   enforced and each intermediate click should not be. */
function AssignAppsDialog({
  open,
  policy,
  onClose,
  onCommit,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  /** Called just before the assignment is written. */
  onCommit: () => void
}) {
  const store = useBrand()
  const [picked, setPicked] = useState<string[]>(policy.appIds)

  /* The seed as a string, so the effect re-seeds only when the assignment
     actually changes, not on every store change. */
  const seed = policy.appIds.join()

  useEffect(() => {
    if (!open) return
    setPicked(seed === '' ? [] : seed.split(','))
  }, [open, seed])

  const changed = picked.join() !== policy.appIds.join()
  const noApps = store.apps.length === 0

  const save = () => {
    /* Unfinished means draft: a policy left with no application becomes one.
       Assigning does not publish in return. */
    const next = { ...policy, appIds: picked }
    onCommit()
    store.savePolicy(picked.length === 0 ? { ...next, status: 'draft' as const } : next)
    const n = picked.length
    const count = `${n} application${n === 1 ? '' : 's'}`
    /* "Protects" only for a policy that decides sign-ins. An active policy with
       no rule turned on decides nothing either, and is not inactive. */
    const why =
      policy.status === 'draft'
        ? 'It is still a draft.'
        : policy.status === 'inactive'
          ? 'It is inactive.'
          : policy.status === 'monitor'
            ? 'It is monitoring.'
            : 'No rule is turned on.'
    store.showToast(
      n === 0
        ? policy.status === 'draft'
          ? `${policy.name} has no applications`
          : `${policy.name} is now a draft`
        : decidesFor(policy)
          ? `${policy.name} now protects ${count}`
          : `${policy.name} is assigned to ${count}. ${why}`,
    )
    onClose()
  }

  return (
    /* A short title, and the policy named once under it as the caption line (owner, 23 Oct 2026: short titles, never a
       long policy name inside the title). The sentence that said what assigning means went with it: the list is the
       question. */
    <Modal
      open={open}
      onClose={onClose}
      title="Applications"
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!changed} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="bassign">
        <p className="bassign__lede">
          <PolicyFact name={policy.name} />
        </p>
        {noApps ? (
          <EmptyState
            compact
            icon={AppWindow}
            title="No applications yet"
            blurb="Add an application, then assign it to this policy."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  onClose()
                  store.go({ name: 'applications' })
                }}
              >
                Go to applications
              </Button>
            }
          />
        ) : (
          /* One field (app-transfer.tsx, 24 Oct 2026): the ones in this policy as chips with the search after them, and
             the ones that can be added listed under it. What an empty list does is said right under the field, and
             only while it is empty, as the builder's Applications panel says it. */
          <AppTransfer
            apps={store.apps}
            picked={picked}
            onChange={setPicked}
            takenBy={(id) => (picked.includes(id) ? undefined : ownerOf(id, store.policies, policy.id)?.name)}
            emptyNote={
              policy.status !== 'draft' ? <p className="bassign__foot">With no applications, this policy becomes a draft.</p> : undefined
            }
          />
        )}
      </div>
    </Modal>
  )
}
