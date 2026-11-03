/* -----------------------------------------------------------------------------
   The builder bar's three quiet tools, hidden (owner, 1 Oct 2026, of the
   Demo · 1:16 button, Learn the board and Read as text: "Hide this 3 as of
   now"). It supersedes the showcase pick of 21 Sep ("keep demo + tour").

   Hidden, not deleted, the way SHOWCASE pins a preview (showcase.ts): each
   flag is read where its door is, and turning one back on brings the door
   back as it was, with everything behind it.

     demo   the bar's Demo · 1:16 (DemoButton) — and the walkthrough's own
            "watch the demo", since the walkthrough goes with `tour`
     tour   the bar's graduation cap, Learn the board, and the walkthrough
            that opened by itself on a first visit to the builder
     read   the bar's Read as text icon; the panel it opened is still the
            Policies row menu's Read as text, which this does not touch

   None has a key or a palette entry of its own; while a flag is off, nothing
   else on the builder opens what it hides.
   -------------------------------------------------------------------------- */

/** Demo · 1:16 on the builder's bar. */
export const BAR_DEMO: boolean = false

/** Learn the board on the builder's bar, and the walkthrough on a first visit. */
export const BAR_TOUR: boolean = false

/** Read as text on the builder's bar. */
export const BAR_READ: boolean = false

/* Save as template, in the ⋯ at the end of the builder's bar (owner, 27 Oct 2026: "add an option for save as
   template"). Not in the builder-version ladder: it is shown at every version, since it is the one way to keep what
   was built here for the next policy. It is offered only for a sign-in policy with a rule on its canvas, and the
   template is what the canvas holds, unsaved edits included (template-from-policy.ts). On, in every build; this is the
   switch should it ever have to go. */
export const BAR_TEMPLATE: boolean = true

/* Copy rules from a policy (owner, 2 Nov 2026; copy-rules.ts): a card on the empty board and a row in the bar's ⋯, for
   a sign-in policy with another policy to copy from. Not in the builder-version ladder, for the same reason as Save as
   template. On, in every build; this is the switch should it have to go. */
export const COPY_RULES: boolean = true

/* Copy rules from a policy as a row in the bar's ⋯ (owner, 2 Nov 2026, later: "can hide this, no need"). Off, the row
   goes, and with Save as template on hold (template-phase.ts) the ⋯ has nothing left in it, so it goes too. The empty
   board's Inherit from an existing policy card is the way in. Hidden, not deleted. */
export const BAR_COPY_RULES: boolean = false

/* The empty board's Use a template opens the same picker as Copy from a policy (owner, 2 Nov 2026: "make the copy from
   policy and start from template same"; screens/board/RulePicker.tsx). Off, it opens the template gallery again
   (create/TemplateSheet.tsx), which is kept as it was. */
export const TEMPLATE_PICKER: boolean = true

/* How Use template and Use existing policy look (owner, 2 Nov 2026, the final version: "use the older popup here as
   well"). 'sheet' is the Xecurify store's own centred popup, its categories down the rail (create/TemplateSheet.tsx);
   'slider' is the same cards in a right slider; 'list' is the list with the chosen one's rules beside it
   (RulePicker.tsx). The last two were tried the same day and are kept here rather than deleted. */
export const PICKER_LOOK: 'sheet' | 'slider' | 'list' = 'sheet'

/* The rule on/off switch, hidden (owner, 23 Oct 2026: "Hide the toggle and
   remove this active inactive rule function as of now"). It sat on the rule
   card and in the panel's rule head. Hidden, not deleted: the card still reads
   `rule.enabled`, so turning this on brings the switch back as it was. */
export const RULE_ON_OFF: boolean = false

/* The panel's Narrow / Widen button, hidden (owner, 23 Oct 2026: "Remove this
   function as well, hide it ... a better, bigger, single-stack form size"). The
   panel is one width now, 600 to start and at most, and the grip in the gutter
   still drags it between 480 and 600. Hidden, not deleted: turning this on
   brings the button back, stepping between those two ends (`NARROW` in
   BoardBuilder.tsx). */
export const PANEL_WIDTH_BUTTON: boolean = false
