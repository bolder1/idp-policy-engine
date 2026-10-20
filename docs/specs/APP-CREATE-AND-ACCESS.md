# Add application, and who signs in to it (13 Oct 2026, v2 after review)

Owner, 13 Oct 2026: "go through the app part, check how an app is created and try to mimic that with our use case, and fix the policy attachment and groups and users in that part."

Sources: the live console's Add Application flow, read 13 Oct in the owner's Chrome, read only and with nothing saved (local note `docs/research/live-console-app-create-13-oct.md`); the 10 Oct live read and spec (local); a code map of the prototype; vendor docs (Okta, Entra, Duo, OneLogin, JumpCloud, Auth0, miniOrange); Mobbin. v2 takes in an adversarial review on three lenses: the owner's rulings, the engine, and admin UX.

## 1. What the live console does

1. **Apps → Add Application → Choose Application.** A catalogue with search, an **All Apps** type filter, "Show custom apps only", "Submit New App Request", **Featured Apps**, then **All Apps** as logo tiles with the protocol under the name.
2. **The app's form.** One page with line tabs, and a Cancel · Back · Next · Save footer whose Save works from every tab.
   - SAML: Basic · Advanced · Login Options · Attributes · Policies · Provisioning · Metadata.
   - OAuth/OIDC: Basic · Advanced · Login Options · Attributes · Policies · Endpoints.
3. **Policies are locked until the app is saved:** "Please configure an application first to Assign Groups", with Save Application. Metadata and Endpoints, the values the admin pastes into the service provider, are locked the same way.
4. **After save, Policies → Assign Group.** A two-step modal: pick up to 20 groups, then First factor, 2FA, Adaptive and Force MFA. Each pick becomes an App Login Policy, one app × one group.
5. Users and groups are never assigned to an app directly. A user's "Associated Apps" follow from the groups their policies name.

**The gaps we fix:** access is cut off from creation; the service-provider values are hidden until save; the app's Policies tab can look empty while a policy protects it (10 Oct); the same binding has two doors with two shapes.

## 2. Our model, kept

- A policy holds many applications (`appIds`) and one audience (`Policy.audience`). Rules narrow inside it through Who.
- Precedence is the engine's: groups or people > everyone > the Global Default (`deciderFor`, pinned to `governingPolicy`). No engine change.
- **G1, answered by the owner 13 Oct:** no group picking from an application; the audience is edited at the builder's start node (§6).

## 3. Add application (wave 1)

### 3.1 Choose application (route `application-new`, no `catalogId`)
- Back link "All applications". Heading "Choose application".
- One bar:
  - search ("Search applications…")
  - a **Type** Picker (All apps · SAML/WS-FED · OAuth/OpenID; the types the prototype cannot add are not offered)
  - a **Show** Picker (All apps · Custom apps), standing in for the live "Show custom apps only"
  - on the right, "Submit new app request", a link-style button that shows a toast
- **Featured apps** shows only while nothing narrows the page. It holds the live list's four that can be added: AWS, Google Apps, Office 365, Salesforce. **All apps** follows as tiles: buttons with the logo, the name and the protocol caption.
- A tile for an application the tenant already has carries an "Added" pill. It can be added again, and its Display name is freed ("Salesforce 2").
- No matches → `NoMatches` with Clear.

### 3.2 The unsaved application (route `application-new` with `catalogId`)
**One form for create and edit:** this is the application page in a "new" mode, not a separate wizard.
- Back link "Choose application". Head: logo, the Display name as the heading (live), and a protocol badge.
- **Line tabs:** Basic · Advanced · Sign-in options · Attributes · Policies · Metadata (SAML) / Endpoints (OIDC). Users and Groups appear once the application is saved. "Login Options" becomes "Sign-in options" (house rule).
- **Footer**, the live one: Cancel · Back · Next · **Save**. Save is orange and works on every tab. Next is the next tab.
  - Nothing is ever disabled. Save pressed with Basic incomplete opens Basic and states each problem under its field.
  - Save creates the application (`addApp`), with a toast "<name> added." and the `success` cue. It opens the application's page on **Policies**, where the Global Default row shows what decides until a policy is added.
- **Leaving** with anything changed from the starting values asks first (`useLeaveGuard`). The dialog's Save is "Save application" whenever Basic is complete; it saves without navigating. The footer's own Save sets a done ref first, so the guard never catches it.
- **Metadata / Endpoints** are readable before saving. This is the live gap fixed: the IdP values, each with Copy.

**Fields.** Labels sit over fields. Live description lines become TipDots only where a wrong choice is likely; no helper sentence renders under a field.
- **Basic.**
  - SAML: Display name * (freed catalogue name, up to 50), SP entity ID or issuer *, ACS URL * (https), Audience URI, Single logout URL.
  - OIDC: Display name *, Redirect URL * (plus "Add redirect URL"), Client ID * (copy, Regenerate), Client secret * (masked, show, copy, Regenerate), Subject, Description.
- **Advanced** (the live defaults):
  - SAML: Signed request off · Sign response on · Sign assertion off · Signature algorithm RSA-SHA256 · Encrypt assertion off · Relay state (None / Custom attribute value / Custom profile attribute / Custom group attribute, plus a value field) · Override relay state off · Logout response binding HTTP-POST · IdP-initiated logout request binding HTTP-Redirect · SAML authentication validity period 300 · Enable shared identity off · AuthnContext class PasswordProtectedTransport.
  - OIDC: Access token expiry (in hours) 1 · ID token expiry (in hours) 1 · Refresh token expiry (in days) 14 · Signature algorithm RSA-SHA256 · Client credential grant off · Enable shared identity off.
- **Sign-in options.**
  - SAML: Force authentication off · Show on end user dashboard on.
  - OIDC: Show on end user dashboard off · Force authentication off · Allowed logout URIs · Single logout enabled off.
  - Primary identity provider and SSO flows are not asked: each has one answer in this tenant.
- **Attributes.**
  - SAML: Name ID · Name ID format · Add name format · Enable multi-valued attributes · Attribute mapping (name + value rows, Add attribute).
  - OIDC: Enable multi-valued attributes · Attribute mapping.
- **Policies, unsaved.** The Policies tab's own content: the Global Default fallback row and the tab's buttons. Each button first saves the application (Basic incomplete: open Basic with the problems), then carries on:
  - **New policy** → the Untitled draft for everyone, straight into the board (23 Sep ruling), with `from: { appId }`.
  - **Add existing policy** → the application's page with the Add existing drawer open (`open: 'add-existing'`). The attach then runs Before saving: applications as every attach does.

## 4. The application's page (wave 1)

- Tabs: **Basic · Advanced · Sign-in options · Attributes · Policies · Users · Groups · Metadata | Endpoints**. Policies stays the default, and tabs carry no counts.
- Basic, Advanced, Sign-in options and Attributes edit one draft through the existing SaveBar ("Save changes", one review row per changed field). The SaveBar and the leave guard are **blocked** while Basic has a problem, said under its field.
  - Dirty is measured against `setupOf(app)`, so a seed application opens clean.
  - "App secret" becomes **Client secret**.
- The seed applications get made-up setup values (`setupOf`). Every one of them shows on the end user's dashboard.
- **Users tab:** the Deciding policy cell gains a second line saying how the policy reaches the person (`reachOf`):
  - "Through Engineering" (several groups: listed, two then "and N more")
  - "By name"
  - "For everyone"
  - nothing when the Global Default decides, since the cell already names it
- The Users and Groups tabs pass `saving`, so any primary they get turns secondary while the SaveBar is open.

## 5. Elsewhere (wave 1)

- Applications list: **Add application** opens Choose application. Delete stays a toast; deleting an application needs ConfirmDelete's refuse-while-live contract, saved sign-ins and retired ids, and is left for later.
- The Protection drawer's Edit and its row name open the board with `from: { appId }`, so the board's way back lands on the application's Policies tab.
- `sentToBoard` moves to `board-return.ts` as one shared map, so a first deciding policy is celebrated whichever door sent it.
- The end user's Apps page hides an application whose "Show on end user dashboard" is off.
- Sign-in activity, Blocked and Past sign-ins leave out an application added this session (`App.addedAt`): it has no sign-ins yet.
- `ui-copy.test.ts` scans every new file for "login" and the banned words.

## 6. Wave 2: groups and people (owner's answers, 13 Oct 2026)

- **G1 = no group picking from an application.** There is no Assign groups / Assign users door and no Assign drawer. New policy from an application stays an Untitled draft for everyone (23 Sep ruling). Groups narrow per rule in the builder.
- **Superseded 14-15 Oct 2026:** an application has at most one sign-in policy, and Who belongs to rules only. A sign-in policy's start-node pane is titled "Applications" and has no Who section (a post sign-in policy's keeps "Who and applications"). The app's Policies tab is specified in `APP-POLICY-TAB.md`. The bullets below record the 13 Oct build.
- **A policy's groups are seen and changed at the builder's start node.**
  - The start node's sentence names them when the policy is narrowed: "A sign-in from **Finance** or **Sales** arrives at **Salesforce**" (more than two: "from **Finance** or **2 more**"). It says nothing extra for everyone.
  - Its pane, now titled "Who and applications", holds a **Who** section above **Applications**. Who uses the board's two-entity shape: Groups and People rows and the same dialog as a rule's Who, worded for a policy. Nothing chosen reads "Everyone".
  - One Save stores who and applications together ("Save applications" when only applications changed, "Save" otherwise). On a live policy it runs Before saving through the apps guard, which now carries the audience. The guard page lists a "Who" row under What you changed.

## 7. Left out, and why

- Deleting an application (§5).
- Provisioning, Import SP metadata, Upload app logo, Primary identity provider, SSO flows, WS-Fed and the other application types.
- App Access Configuration, Make default, reordering policies.
- A New policy still starts empty, so its last row allows on one factor; the turn-on checks catch anyone newly let in. Starting it from the Global Default's rules is an option for the owner.
