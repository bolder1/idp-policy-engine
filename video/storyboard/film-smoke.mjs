/* A tiny edit over the smoke take, for checking the compositor's product layer
   (window, camera, cursor, click cues, captions, chapter chip) without waiting
   for the full capture. */
export const film = {
  url: 'idp.xecurify.com/admin/policies',
  chapters: [{ id: 'create', n: '01', title: 'Create a policy' }],
  sequence: [
    { kind: 'card', slide: 'chapter', chapter: 'create', dur: 3.9, params: { n: '01', title: 'Create a policy', sub: 'Name it, and choose the applications it protects.', art: 'create' } },
    { kind: 'take', take: 'smoke', chapter: 'create' },
    { kind: 'card', slide: 'step', chapter: 'create', dur: 2.7, params: { n: 1, total: 3, title: 'Who', sub: 'Who is this rule about?', compact: true } },
    { kind: 'take', take: 'smoke', chapter: 'create' },
  ],
}
