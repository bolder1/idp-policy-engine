/* The film, in order: opening slides, then six chapters, then the close.
   Takes are captured by capture.mjs; their subtitles live in takes.mjs. */

const chapter = (id, n, title, sub, art) => ({ kind: 'card', slide: 'chapter', chapter: id, dur: 3.9, params: { n, title, sub, art } })
const step = (n, title, sub) => ({ kind: 'card', slide: 'step', chapter: 'rule', dur: 2.7, params: { n, total: 3, title, sub, compact: true } })
const take = (name, chapterId) => ({ kind: 'take', take: name, chapter: chapterId, placeholder: 20 })

export const film = {
  url: 'idp.xecurify.com/admin/policies',
  chapters: [
    { id: 'create', n: '01', title: 'Create a policy' },
    { id: 'templates', n: '02', title: 'Start from a template' },
    { id: 'rule', n: '03', title: 'Build a rule' },
    { id: 'canvas', n: '04', title: 'Tour the canvas' },
    { id: 'test', n: '05', title: 'Test before you publish' },
    { id: 'publish', n: '06', title: 'Review & publish' },
  ],
  sequence: [
    {
      kind: 'slide',
      slide: 'title',
      dur: 7.5,
      captions: [{ at: 1.4, dur: 5.6, text: 'Xecurify Policy Engine — the flow builder, from a blank policy to a published one.' }],
    },
    {
      kind: 'slide',
      slide: 'decide',
      dur: 8.8,
      captions: [{ at: 1.0, dur: 7.3, text: 'Every sign-in to every application gets a decision: let them in, ask for a second factor, or refuse.' }],
    },
    {
      kind: 'slide',
      slide: 'order',
      dur: 10.2,
      captions: [
        { at: 1.0, dur: 4.4, text: 'A policy is an ordered list of rules. The first rule that matches decides the sign-in.' },
        { at: 5.6, dur: 4.3, text: 'Move a rule, and you change what the policy does. The order is the policy.' },
      ],
    },
    {
      kind: 'slide',
      slide: 'anatomy',
      dur: 9.6,
      captions: [{ at: 1.0, dur: 8.1, text: 'Every rule answers three questions — who it’s about, when it applies, and what happens then.' }],
    },
    {
      kind: 'slide',
      slide: 'confidence',
      dur: 9.4,
      captions: [{ at: 1.0, dur: 7.9, text: 'And before anything goes live, you can rehearse a sign-in, attack the policy, and see exactly what changes.' }],
    },
    {
      kind: 'slide',
      slide: 'agenda',
      dur: 8.2,
      music: 'title',
      captions: [{ at: 1.0, dur: 6.8, text: 'Here’s the whole journey — six stops, from a blank policy to a published one.' }],
    },

    chapter('create', '01', 'Create a policy', 'Name it, and choose the applications it protects.', 'create'),
    take('create', 'create'),

    chapter('templates', '02', 'Start from a template', 'Browse ready-made policies — or begin with a blank one.', 'templates'),
    take('templates', 'templates'),

    chapter('rule', '03', 'Build a rule', 'Who it’s about. When it applies. What happens then.', 'rule'),
    step(1, 'Who', 'Who is this rule about?'),
    take('who', 'rule'),
    step(2, 'If', 'When does it apply?'),
    take('condition', 'rule'),
    step(3, 'Then', 'What happens when it matches?'),
    take('then', 'rule'),

    chapter('canvas', '04', 'Tour the canvas', 'Everything you can do on the board itself.', 'canvas'),
    take('canvas', 'canvas'),

    chapter('test', '05', 'Test before you publish', 'Rehearse a sign-in, run a break-in test, and see what changes.', 'test'),
    take('test', 'test'),

    chapter('publish', '06', 'Review & publish', 'Read it back in plain English — then ship it.', 'publish'),
    take('publish', 'publish'),

    {
      kind: 'slide',
      slide: 'outro',
      dur: 9.5,
      music: 'outro',
      capPos: 'center',
      captions: [{ at: 1.3, dur: 6.8, text: 'Write it, test it, publish it — all on one canvas.' }],
    },
  ],
}
