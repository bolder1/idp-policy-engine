/* -----------------------------------------------------------------------------
   Templates the tenant manages, on hold (owner, 2 Nov 2026: "remove the template from the left-side tab, hide it as of
   now. Save as template also should be hidden from the options … In this phase we are not going to push save as
   template or the template itself. We are just providing some Xecurify templates by default … the user can't manage
   templates, only pick templates").

   Off, these go and nothing else does:
     - the Templates page's place in the rail (Shell.tsx), and so its store and its Use;
     - Save as template, wherever it was offered: the Policies list's row menu, the builder's ⋯, an application's
       Policies tab (screens/status-options.ts `canSaveAsTemplate`);
     - Your templates as a shelf of Use template (create/TemplateSheet.tsx, screens/board/copy-rules.ts), so the
       picker offers Xecurify's templates alone.
   Use template on the board stays: picking one of Xecurify's is this phase. Hidden, not deleted: on, all of it comes
   back as it was.

   ON again (owner, 6 Nov 2026: "bring Save as template back"; the popup shows saved templates and Xecurify's).
   -------------------------------------------------------------------------- */
export const TEMPLATES_MANAGED: boolean = true

/* A template card's face (owner, 2 Nov 2026: "real-time showcase might be a problem … based on the template, add custom
   SVGs"): on, a picture of what the template is about (create/CardPicture.tsx); off, the live rule stack it drew
   before, its rules numbered with their outcomes. Kept for when the product can draw a template's rules on its card. */
export const CARD_PICTURES: boolean = true

/* Template categories on the cards and in the store (owner, 3 Nov 2026: "hide the filter and the tags as of now, we are not sure we are
   providing categories or not"): off, the store has no category chips and no category tab on a card. Hidden, not deleted: on, both come
   back as they were. */
export const TEMPLATE_CATEGORIES: boolean = false

/* The pills (the start cards' source tabs, the template cards' category tab) are hidden until Alt+T: source-pills.ts. */
