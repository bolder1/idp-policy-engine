/* ---------------------------------------------------------------------------
   Logo registry — the single place an app's visual identity is declared.

   Each entry names the app, the domain its logo is fetched from, and a
   fallback tint + monogram used when no logo can be resolved. The fetcher
   (scripts/fetch-logos.mjs) reads this file, so adding an app to the catalogue
   is a one-line change followed by `npm run logos`.
   --------------------------------------------------------------------------- */

export interface LogoSource {
  /** Matches the app id used everywhere else in the app data. */
  id: string
  name: string
  /** Canonical domain. Logo providers key off this. */
  domain: string
}

/* `fallbackTint` and `fallbackMonogram` were here, one pair per app, and
   `AppLogo` painted the initials on the tint whenever a fetch failed.

   Nothing reads them now. The fallback is one generic application icon rather
   than a per-app monogram, for the reason set out in `AppLogo`: initials are a
   logo's shape without its content, and for the sixteen internal systems in
   this tenant they were two letters of a name printed in full beside them.
   Removing the fields rather than leaving them unread, because a registry
   carrying a brand colour nothing paints is a registry that will eventually be
   updated by somebody expecting it to show up. */

export const LOGO_SOURCES: LogoSource[] = [
  { id: 'salesforce', name: 'Salesforce', domain: 'salesforce.com' },
  { id: 'workday', name: 'Workday', domain: 'workday.com' },
  { id: 'github', name: 'GitHub Enterprise', domain: 'github.com' },
  { id: 'm365', name: 'Microsoft 365', domain: 'microsoft.com' },
  { id: 'jira', name: 'Jira', domain: 'atlassian.com' },
  { id: 'slack', name: 'Slack', domain: 'slack.com' },
  { id: 'aws', name: 'AWS Console', domain: 'aws.amazon.com' },
  { id: 'zoom', name: 'Zoom', domain: 'zoom.us' },
  { id: 'box', name: 'Box', domain: 'box.com' },
  { id: 'servicenow', name: 'ServiceNow', domain: 'servicenow.com' },
  { id: 'okta', name: 'Okta', domain: 'okta.com' },
  { id: 'google', name: 'Google Workspace', domain: 'google.com' },
  { id: 'dropbox', name: 'Dropbox', domain: 'dropbox.com' },
  { id: 'zendesk', name: 'Zendesk', domain: 'zendesk.com' },
  { id: 'confluence', name: 'Confluence', domain: 'atlassian.com' },
  { id: 'miniorange', name: 'miniOrange', domain: 'miniorange.com' },
]

/**
 * Providers tried in order. Each returns a URL for a given domain; the fetcher
 * accepts the first that responds with a usable image. Ordered by quality:
 * a real brand mark first, a large favicon second, the site's own icon last.
 */
export const PROVIDERS: { name: string; url: (domain: string) => string }[] = [
  { name: 'clearbit', url: (d) => `https://logo.clearbit.com/${d}?size=128` },
  { name: 'duckduckgo', url: (d) => `https://icons.duckduckgo.com/ip3/${d}.ico` },
  { name: 'google-s2', url: (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128` },
  { name: 'favicon', url: (d) => `https://${d}/favicon.ico` },
]
