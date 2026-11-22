# Empty states: every place, for the front end

State as of **20 Nov 2026**. This lists every empty state in the console: where it appears, what it says, and what it draws. It also says how to see each one on a local server.

## See them: the empty tenant

The empty tenant is a **review tool, not part of the product**. It will be removed (owner, 20 Nov 2026). There are two ways in, both on the **Design** sign-in only (`ROLLOUT.emptyTenant`). Dev handoff and Tester always open their usual tenants.

1. **Go empty** in the account menu, on any server. A card lists what is cleared, each row drains in turn, then the tab reloads empty. **Bring back data** in the same menu reverses it. The switch is a `sessionStorage` flag, so it holds across reloads in that tab only; other tabs keep their data.
2. **The empty server:**

   ```
   npm run dev:empty      # http://localhost:5191  (.claude/launch.json: "policy-empty")
   ```

   It is a Vite mode (`--mode empty`), so it always opens empty, and the account menu offers neither switch. `npm run dev`, the build and the deploy never open on it.

On the empty tenant the **Dashboard** is one empty state ("Nothing to show yet", Add application, `dashboard/DashboardEmpty.tsx`). Its tiles are modelled sign-ins that would read as real numbers on an empty tenant.

**To remove the tool:** delete `empty-tenant.ts`, `empty-wipe.tsx`, `empty-wipe.css` and `dashboard/DashboardEmpty.tsx`; remove their call sites in `store.tsx`, `ProfileMenu.tsx`, `BrandApp.tsx` and `main.tsx`, the `dev:empty` script and launch entry, and `ROLLOUT.emptyTenant`. The drawings (`empty-art.tsx`, `ROLLOUT.emptyArt`) are product and stay.
- What a tenant has on its first day stays, because the product ships it:
  - the Global Default ("Baseline access")
  - the Authentication methods catalogue
  - Xecurify's templates
  - the shipped risk signal profile
- Everything a tenant authors or brings is empty: policies, zones, device profiles, hooks, applications, users, groups, display tokens, saved sign-ins, the change log, the old console's policies.
- `node tools/rigs/empty-states/explore.cjs` walks the rail pages and screenshots each one into `tools/rigs/empty-states/out/`.

## The component

There is one component for all of them: `EmptyState` in `src/brand/empty.tsx`. It has a mark, a title, at most one line, and an action.

| Prop | Use |
|---|---|
| `art` | An animated drawing (`src/brand/empty-art.tsx`). Only for a page whose whole content is the empty state. |
| `icon` | A Lucide icon in a circle. Used when there is no `art`, and always on `compact` states. |
| `title` | Names the state: "No zones yet". Sentence case. |
| `blurb` | One line, or none. Never a second line. |
| `action` | One primary button, or a primary plus one secondary control. |
| `compact` | An empty **section** inside a panel that already has a heading. Smaller mark, less air. |
| `live` | Announces the state (`role="status"`) when it replaces a list as someone types. |

`NoMatches` (same file) is the search or filter that matched nothing. It always uses the icon, and its action brings the list back.

### The drawings (art)

Every drawing is one scene in a 132 × 104 SVG:

- **The object** is drawn in `--surface-inset` with a `--border-default` edge, 1.5px strokes and a few inner lines.
- **One badge** in `--blue` (the selection blue, never orange) drops onto the object's corner and sends out a ring.
- **The loop** is 2.4 s, and the ring starts 0.6 s after the drop. Every scene shares it through `Drop`.
- **Reduced motion:** the drawing is still, with the badge at rest and no ring.

| Drawing | Object | Badges used |
|---|---|---|
| `ZonesArt` | A globe; the badge is a pin | (pin) |
| `DevicesArt` | A phone | (shield) |
| `PoliciesArt` | A page with a shield and three rule lines | plus, publish, shield, clock |
| `AppsArt` | A window with four app tiles | plus, check |
| `UsersArt` | A card with one person | plus |
| `GroupsArt` | Three people | plus |
| `RolesArt` | An ID card | shield |
| `HooksArt` | Two blocks joined by a dashed call | bolt |
| `TokensArt` | A key fob | plus, check |
| `ActivityArt` | A list of rows | check |
| `RiskArt` | A gauge | plus |
| `DashboardArt` | Two tiles over a chart tile | plus |
| `RulesArt` | Two rule cards and an empty dashed slot | plus |
| `FavoritesArt` | Three cards, the middle one starred | (star) |

**Rollout.**
- Zones, Device profiles and Favorites have drawn for every line since 18 Nov.
- The others are **Design only** for now (`ROLLOUT.emptyArt`, `NEW_EMPTY_ART`). Dev handoff and Tester still see the icon circle there until the owner signs them off.

## Page-level empty states (with a drawing)

Reach = how to get there on the empty server.

| Place | Reach | Drawing | Title | Line | Action | Code |
|---|---|---|---|---|---|---|
| All Policies, New policies | Policy → All Policies | Policies · plus | No policies yet | Sign-ins use the Global Default Policy until you add a policy. | New policy | `screens/Policies.tsx` |
| All Policies, nothing to publish | Policies, while the move has nothing staged | Policies · publish | Nothing waiting to publish | Policies you publish move to New policies. The old ones stay in the Old policies tab. | | `screens/Policies.tsx` |
| Zones | Policy → Zones | Zones | No zones yet | A zone names IP networks and locations for use in policy rules. | New zone | `screens/ZonesFinal.tsx` |
| Device profiles | Policy → Device profiles | Devices | No device profiles yet | Create a profile to check device health or recognise trusted devices. | Create new profile | `screens/DeviceFingerprintV2.tsx` |
| Risk signal profiles | Policy → Risk signal profile, once the shipped profile is deleted | Risk · plus | No risk profiles | Create one to set how much each risk signal counts. | | `screens/RiskSignals.tsx` |
| External hooks | Policy → External Hooks | Hooks · bolt | No hooks yet | Add a hook to let a rule check an outside system, like a fraud score. | New hook | `screens/Hooks.tsx` |
| Applications | Apps | Apps · plus | No applications yet | Connect an application to protect its sign-ins with a policy. | Add application | `screens/Applications.tsx` |
| Application → Policies | An application's Policies tab | Policies · shield | No policies on this application | | | `screens/ApplicationPage.tsx` |
| Application → Post sign-in | An application's post sign-in tab | Policies · clock | No post sign-in policies on this application | | | `screens/AppPostSignIn.tsx` |
| Application → Users | An application's Users tab | Users · plus | No users yet | | | `screens/app-people-tabs.tsx` |
| Users | Users → User List | Users · plus | No users yet | | Add user | `screens/UsersPage.tsx` |
| User roles | Users → User Roles | Roles · shield | No roles yet | | Add role | `screens/UsersPage.tsx` |
| Groups | Groups → Manage Groups | Groups · plus | No groups yet | | Add group | `screens/GroupsPage.tsx` |
| Group → Users | A group's Users tab | Users · plus | No users in this group | | | `screens/GroupsPage.tsx` |
| Display tokens, Tokens tab | Authentication methods → Display Token → Manage tokens | Tokens · plus | No tokens yet | Add each token, or upload a CSV of them. | | `screens/DisplayTokensPage.tsx` |
| Display tokens, Assign tab | Same page, Assign tab | Tokens · plus | No tokens to assign | Add tokens first, then assign them here. | | `screens/DisplayTokensPage.tsx` |
| Display tokens, none assigned | Same page, with tokens and none assigned | Tokens · check | No tokens assigned yet | Give each person the token they carry. | | `screens/DisplayTokensPage.tsx` |
| Sign-in activity | All Policies → Sign-in activity | Activity · check | No sign-ins to show yet | Sign-ins and policy changes appear here once a policy is deciding sign-ins to an application. | | `screens/SignInActivity.tsx` |
| Policy builder, no rules | All Policies → New policy, then remove every rule | Rules · plus | No rules yet | Logins with no matching rule get the default outcome. | | `screens/PolicyBuilderMain.tsx` |
| Coverage | Coverage, with no applications or no groups | Apps or Groups · plus | No applications yet / No groups yet | Coverage shows each application against each group. | | `screens/Coverage.tsx` |
| Dashboard (customizable) | Dashboard, New, with every widget removed | Dashboard · plus | This dashboard is empty | | | `dashboard/Dashboard.tsx` |
| Access checks, People | Behind `PEOPLE_AND_BREAK_IN` | Users · plus | No people in the directory | | | `screens/sign-in-tests/PeopleTable.tsx` |
| Access checks, Saved sign-ins | Behind `SAVED_SIGN_INS` | Activity · check | No saved sign-ins | | | `screens/sign-in-tests/SavedTable.tsx` |
| My apps (end user) | The end-user launcher | Apps · check | No apps yet | Apps your administrator gives you access to appear here. | | `screens/UserApps.tsx` |

Empty cells mean the code passes none. Every title, line and action in the rows reached from the rail (All Policies, Zones, Device profiles, External hooks, Applications, Users, User roles, Groups) was read off the empty server on 20 Nov. For the other rows, the copy comes from the code; check their actions in the code before building.

**Line wording.** The builder says "Logins with no matching rule" (`PolicyBuilderMain.tsx`). The copy rule is "sign-in", so this line should read "Sign-ins with no matching rule get the default outcome." It is listed here and not yet changed.

## Section empty states (icon, `compact`)

These are inside a panel or a tab that already has a heading, so they keep the icon circle.

| Place | Icon | Title | Line | Code |
|---|---|---|---|---|
| Post sign-in policies list | ShieldPlus | No post sign-in policies yet | | `screens/Policies.tsx` |
| Policy → Applications pane | AppWindow | No applications yet | Add an application, then assign it to this policy. | `screens/Policies.tsx` |
| App protection panel | ShieldPlus | No policies on this application | Sign-ins fall through to the tenant default below. | `screens/AppProtection.tsx` |
| Application → Sign-in activity | History | No sign-ins yet / No sign-ins match | | `screens/app-activity.tsx` |
| Group custom fields | ListPlus | No group custom fields | | `screens/GroupsPage.tsx` |
| Group → Applications | AppWindow | No applications | | `screens/GroupsPage.tsx` |
| Sign-in activity → Policy changes | History | No changes yet | | `screens/SignInActivity.tsx` |
| CA chains (Authentication methods) | FileBadge | No CA chains yet | Add a root CA or certificate chain to check CAC/PIV cards against. | `screens/ca-chain-drawer.tsx` |
| Policy overview, no rules | ListX | No rules yet | Every sign-in gets the default outcome. | `screens/overview.tsx` |
| Used by (zone, profile, hook) | Unlink | Not used by any policy | (per library) | `screens/used-by.tsx` |
| Monitoring | Eye | No modelled sign-ins | | `screens/monitoring-page.tsx` |
| Template store / sheet | Template | No Xecurify templates | Templates from miniOrange show here. | `create/TemplateStore.tsx`, `create/TemplateSheet.tsx` |
| Template sheet, Favorites | FavoritesArt | (favourites) | | `create/TemplateSheet.tsx` |
| Who picker / audience drawer | Users, UserRound, BookUser | No groups yet / No people yet / No groups or people | Groups come from the directory. / People come from the directory. / Add users and groups to the directory first. | `screens/audience-drawer.tsx`, `screens/who-picker.tsx` |
| Display token forms | KeyRound, Users | No tokens yet / Every token is assigned / No users yet | Add a token first. / Add people to the directory, then assign tokens. | `screens/display-token-forms.tsx` |
| Zone editor, IP networks | Network | No IP networks yet | Add addresses, CIDR blocks, ranges or ASNs. Left empty, any network matches. | `screens/ZonesFinal.tsx` |
| Zone editor, locations | Globe | No locations yet | Add countries, states or cities, and give a city a range to cover the area around it. Left empty, any location matches. | `screens/ZonesFinal.tsx` |
| Device profile editor | ShieldOff | No checks yet / No signals | (per mode) | `screens/device-profile-parts.tsx` |
| Builder, Save as template | ListX | No rules | Add a rule before saving this policy as a template. | `screens/builder-dialogs.tsx` |
| Builder, Copy rule | CopyPlus | No policy to copy into | A rule can only be copied to another policy of the same type. | `screens/builder-dialogs.tsx` |
| Builder Check access docks | AppWindow, History, BookmarkCheck | No applications on this policy / No sign-ins to model | | `screens/testing/Dock*.tsx` |
| Break-in test | Users, ListFilter | No scripted sign-ins for this audience / No sign-ins | | `screens/break-in-view.tsx` |
| Authentication methods, a filtered group | ShieldCheck | No methods in this group | Set the filter to All methods to see them. | `screens/AuthMethods.tsx` |
| Pickers (any) | ListX | No {things} yet | There is nothing to choose from. | `picker.tsx` |

## Searches and filters that match nothing (`NoMatches`)

Every searchable list draws `NoMatches` when the search or filter returns nothing: "No {things} match “{search}”", one line, and the action that clears it. It is in about 40 places: every library page, Users, Groups, Applications, the app catalogue, the template sheet and store, pickers, the command bar, the Who editor, the condition popover and Access checks' Identity field. Find them with `grep -rn "<NoMatches" src/brand`.

## Not found and errors (icon)

| Place | Title | Line | Code |
|---|---|---|---|
| Application | Application not found | It may have been deleted. | `screens/ApplicationPage.tsx` |
| Group | Group not found | It may have been deleted. | `screens/GroupsPage.tsx` |
| Policy (builder, details) | Policy not found | It may have been deleted. | `screens/PolicyBuilderMain.tsx`, `screens/PolicyDetails.tsx` |
| User | User not found | | `screens/UserDrawer.tsx` |
| Any page that crashed | This page didn't load | Your other changes are kept. | `error-boundary.tsx` |
