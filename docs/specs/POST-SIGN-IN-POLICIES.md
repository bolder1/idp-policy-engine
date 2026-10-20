# Post sign-in policies (13 Oct 2026)

Owner's brief, 13 Oct 2026: add a second policy type that acts after sign-in, during the session. MoM: https://claude.ai/artifact/9ymzcs2Ndd9y8CyQbXAYhu (private). Research (local): `docs/research/post-login-13-oct/synthesize.md`. Model: `src/brand/post-sign-in.ts`.

## Rulings (owner, 13 Oct 2026)

- **Names.** Today's type is the **Sign-in policy**; the new type is the **Post sign-in policy**. "Login" never appears on screen.
- **Kept apart.** A post sign-in policy is never part of the sign-in engine, Access checks, an application's sign-in Policies tab, Add existing policy, the Protection cell on the Apps list, or Sign-in activity.
- **The policy is independent of applications.** It holds only its Who, its rules and the action on "Nothing else matched".
- **One builder.** A post sign-in policy is built in the same board as a sign-in policy (owner: "use the same sign in builder for post sign in as well… don't want to add new builder until needed"). There is no separate page.
- **Applications are linked from outside.** Links are made from the application's page, and each link carries the events of that application the policy decides. Many applications can be linked to one policy. An event of an application is decided by at most one policy.
- **Actions:** Allow · Deny · Step up · Terminate session · Block device. Block device applies to that application only.
- **Turning on.** A policy can be turned on only when it is complete: every enabled rule has an action, and so has "Nothing else matched". Until then it stays a draft, and the reason is shown on the page. The button is never disabled. Being linked to no application does not stop it.
- **Statuses:** Draft · Active · Inactive. There is no Monitoring.

## Model (`post-sign-in.ts`)

- The policy is `type: 'Session'`, with `session: { links: [{ appId, eventIds }] }`. `appIds` mirrors the links.
- **Rules** are the board's own: `Policy.rules` (Who / If / Then) with `Rule.action` as the Then, and `Policy.fallback.action` on "Nothing else matched". All conditions must hold (AND), and the first matching rule decides. `turnOnIssue` names the first rule, or the last row, with no action.
- **Conditions** fall into seven groups: Session, Device, Network, Risk, User, Event and Time.
  - Event conditions (record count, file label, destination, amount, volume) only hold on events that carry that detail.
- **Events per application.** An application's in-app events come from the catalogue (Salesforce, Microsoft 365, Google Workspace, Slack, GitHub, AWS, Workday, Box). Six session events follow on every app: IP or location change, Device change, Device compliance change, Risk level change, Account change, Session age.
- **How an event arrives:**
  - *Checked before*: the app asks first.
  - *Reported after*: a Deny cannot stop it. This is said where the link is made.
  - *Session*: the IdP sees it.

## Screens

1. **Policies page.** Line tabs **Sign-in** and **Post sign-in**, with no counts.
   - The Post sign-in tab lists post sign-in policies: Policy name · Applications · Status · Actions.
   - New policy creates an Untitled draft of that type and opens it in the board. There is no dialog.
   - Row menu: Edit, the status switch, Delete. No Monitor, Duplicate (an event belongs to one policy), Read as text or Save as template.
2. **The board** (route `board`, the sign-in builder), with `post-board.ts` and `PostThen.tsx` switching what differs:
   - **Start node:** "An event in Salesforce and 1 more", or "Not linked to any application". Its pane keeps Who and lists the linked applications read only, each with its events; the app's name opens its Post sign-in tab. Who saves on its own and skips the sign-in checks.
   - **If:** the 16 post sign-in conditions plus the shared ones; never Device risk score or ML risk score. Number conditions carry their unit ("1000 records"). Sign-in hours and days read Event hours and Event days.
   - **Then:** five option cards (Allow · Deny · Step up · Terminate session · Block device), on each rule and on "Nothing else matched". A rule with no action reads "Not set" and shows Needs setup.
   - **Saving and turning on:** a draft always saves. A live policy with a rule left without an action is refused: the board selects that card, marks it and says the reason under its Then. Turn on from the status pill is refused the same way, with a toast.
   - **Left out for this type:** Check access, Past sign-ins, Read as text, Describe it, the template chooser and the checks before saving. The deny message (its default text is about signing in).
   - **Back:** to the application's Post sign-in tab when opened from there, else Policies on the Post sign-in tab.
3. **Application page.** It gains a **Post sign-in** tab after Policies (saved applications only).
   - **List:** the linked post sign-in policies. Each row shows the policy name (opens the board), the events covered here, and its status. The row menu has Edit events, Open policy and Unlink.
   - **Link policy** opens a slider, in two steps:
     - Step 1: pick the policy, or **Create new policy**, which makes an Untitled draft already linked.
     - Step 2: tick this application's events. Events another policy holds are shown with that policy's name and can't be picked. Events reported after are tagged, and if the policy can Deny, one line says Deny can't stop them. At least one event is needed; the reason appears under the list, and the button is never disabled.

## Left for later

- Check access for events.
- Connector-sourced event lists.
- Step up method and duration.
- Terminate scope beyond this application.
- Post sign-in on an unsaved application.
