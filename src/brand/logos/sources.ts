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
  /** Used when every remote source fails, so the UI never shows a broken image. */
  fallbackTint: string
  fallbackMonogram: string
}

export const LOGO_SOURCES: LogoSource[] = [
  { id: 'salesforce', name: 'Salesforce', domain: 'salesforce.com', fallbackTint: '#00a1e0', fallbackMonogram: 'SF' },
  { id: 'workday', name: 'Workday', domain: 'workday.com', fallbackTint: '#f38b00', fallbackMonogram: 'WD' },
  { id: 'github', name: 'GitHub Enterprise', domain: 'github.com', fallbackTint: '#24292e', fallbackMonogram: 'GH' },
  { id: 'm365', name: 'Microsoft 365', domain: 'microsoft.com', fallbackTint: '#d83b01', fallbackMonogram: 'M3' },
  { id: 'jira', name: 'Jira', domain: 'atlassian.com', fallbackTint: '#2684ff', fallbackMonogram: 'JR' },
  { id: 'slack', name: 'Slack', domain: 'slack.com', fallbackTint: '#611f69', fallbackMonogram: 'SL' },
  { id: 'aws', name: 'AWS Console', domain: 'aws.amazon.com', fallbackTint: '#ff9900', fallbackMonogram: 'AW' },
  { id: 'zoom', name: 'Zoom', domain: 'zoom.us', fallbackTint: '#2d8cff', fallbackMonogram: 'ZM' },
  { id: 'box', name: 'Box', domain: 'box.com', fallbackTint: '#0061d5', fallbackMonogram: 'BX' },
  { id: 'servicenow', name: 'ServiceNow', domain: 'servicenow.com', fallbackTint: '#62d84e', fallbackMonogram: 'SN' },
  { id: 'okta', name: 'Okta', domain: 'okta.com', fallbackTint: '#007dc1', fallbackMonogram: 'OK' },
  { id: 'google', name: 'Google Workspace', domain: 'google.com', fallbackTint: '#4285f4', fallbackMonogram: 'GW' },
  { id: 'dropbox', name: 'Dropbox', domain: 'dropbox.com', fallbackTint: '#0061ff', fallbackMonogram: 'DB' },
  { id: 'zendesk', name: 'Zendesk', domain: 'zendesk.com', fallbackTint: '#03363d', fallbackMonogram: 'ZD' },
  { id: 'confluence', name: 'Confluence', domain: 'atlassian.com', fallbackTint: '#1868db', fallbackMonogram: 'CF' },
  { id: 'miniorange', name: 'miniOrange', domain: 'miniorange.com', fallbackTint: '#eb5424', fallbackMonogram: 'mO' },
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
