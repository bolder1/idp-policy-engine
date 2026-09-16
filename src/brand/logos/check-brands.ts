import type { Brand } from './BrandMark'

/* Which device checks are about a brand, keyed by the check's id.

   One record, read by every surface that draws a check's mark, so the mark is
   decided by what the check IS rather than by matching words in its name. A
   check with no entry is not about a brand and keeps its neutral icon. Every
   key is asserted to be a real check id in fingerprint.test.ts, so a renamed
   id fails a test instead of quietly falling back to the generic icon. */
export const CHECK_BRAND: Readonly<Record<string, Brand>> = {
  'os-windows': 'windows',
  'os-android': 'android',
  'os-ios': 'apple',
  'os-macos': 'apple',
  'browser-chrome': 'chrome',
  'browser-edge': 'edge',
  'browser-firefox': 'firefox',
  'browser-safari': 'safari',
  'mo-authenticator': 'miniorange',
  'mo-agent': 'miniorange',
}
