/* The film, in order (storyboard/BEATS-v7.md): the intro; the builder broken
   down on a stage and filmstrip — real product footage from the unspoken
   `parts` take, one part at a time — whose six strip cards then dock onto the
   saved Workday board, tilted in 3D, and dissolve into the live showcase take;
   what a policy is;
   six chapters of the guided demo, each opened by a push banner, with the
   priority graphic cut in ahead of the live reorder; the outro. Takes are
   captured by capture.mjs in their own order (takes-v2.mjs TAKES — the
   showcase is filmed last, shown second); every spoken line lives in lines.mjs
   and is paced by its voice-over. Subtitles sit in their own band under the
   picture, so no slide needs an `avoid` rect.

   Slide items carry `sfx: [{ type, at, gain, after? }]` — `at` is seconds from
   the slide's start or, with `after: '<line id>'`, from that line's spoken
   end — and a `dur` that is a minimum, or 'auto' for lead + lines + gaps +
   tail; the edl stretches it to fit the voice. `out: 'fade'` dissolves a take
   into the slide after it, and a slide over the first frame of the take after
   it (the bento → showcase seam, where the two are the same pixels). */
import { CHAPTERS } from './lines.mjs'

const banner = (id) => {
  const c = CHAPTERS.find((x) => x.id === id)
  return { kind: 'banner', chapter: id, dur: 2.3, params: { n: c.n, title: c.title, kicker: c.kicker } }
}
const take = (name, chapterId, extra = {}) => ({ kind: 'take', take: name, chapter: chapterId, placeholder: 20, ...extra })

export const film = {
  url: 'idp.xecurify.com/admin/policies',
  chapters: CHAPTERS,
  sequence: [
    // the claim and the name on bare ground, then a cut
    { kind: 'slide', slide: 'hook', dur: 8.4, lines: ['hk.1'], lead: 1.2, tail: 1.5, music: 'board', out: 'cut', sfx: [{ type: 'thump', at: 1.2, gain: 0.45 }] },

    // the builder's parts on a stage over a strip of six cards, each playing its footage from
    // the `parts` take as its line is spoken; 0.4 s after bt.5 the stage shrinks into the last
    // card (a soft pop), then the six cards fly onto the showcase take's first frame (a whoosh,
    // a pop as each lands, a thump as it lies flat). The tail holds the shrink and the dock.
    {
      kind: 'slide',
      slide: 'bento',
      dur: 'auto',
      lines: ['bt.1', 'bt.2', 'bt.3', 'bt.4', 'bt.5'],
      lead: 1.0,
      gap: 0.35,
      tail: 5.5,
      music: 'board',
      out: 'fade',
      params: { dockTake: 'showcase', sourceTake: 'parts', dockDelay: 0.4 },
      sfx: [
        // the stage shrinks into its slot at +0.4; the dock starts at +0.9 and lies flat at +4.9
        { type: 'pop', after: 'bt.5', at: 0.4, gain: 0.3 },
        { type: 'whoosh', after: 'bt.5', at: 0.9, gain: 0.6 },
        { type: 'pop', after: 'bt.5', at: 1.8, gain: 0.35 },
        { type: 'pop', after: 'bt.5', at: 1.98, gain: 0.35 },
        { type: 'pop', after: 'bt.5', at: 2.16, gain: 0.35 },
        { type: 'pop', after: 'bt.5', at: 2.34, gain: 0.35 },
        { type: 'pop', after: 'bt.5', at: 2.52, gain: 0.35 },
        { type: 'pop', after: 'bt.5', at: 2.7, gain: 0.35 },
        { type: 'thump', after: 'bt.5', at: 4.9, gain: 0.35 },
      ],
    },

    // the live tour; the bento's last frame is this take's first, so the seam is invisible
    take('showcase', null, { out: 'fade', music: 'board' }),

    // what a policy is, before the demo builds one
    { kind: 'slide', slide: 'concept', dur: 'auto', lines: ['pc.1', 'pc.2', 'pc.3'], lead: 0.8, gap: 0.4, tail: 1.0, music: 'board', out: 'cut' },

    banner('board'),
    take('board', 'board'),

    banner('create'),
    take('create', 'create'),

    banner('rule1'),
    take('rule1', 'rule1'),

    banner('rule2'),
    take('rule2', 'rule2'),

    // the priority chapter opens on the graphic, then cuts to the live reorder
    banner('order'),
    { kind: 'slide', slide: 'priority', dur: 'auto', lines: ['pr.1', 'pr.2'], lead: 0.8, gap: 0.4, tail: 0.8, music: 'board', out: 'cut' },
    take('order', 'order'),

    banner('save'),
    // the window dissolves to ground while the outro starts underneath
    take('save', 'save', { out: 'fade' }),

    { kind: 'slide', slide: 'outro', dur: 6.6, lines: ['out.1'], lead: 1.0, tail: 0.6, music: 'outro', sfx: [{ type: 'thump', at: 1.0, gain: 0.4 }] },
  ],
}
