import type { AuthMethod } from '../methods'

/* -----------------------------------------------------------------------------
   CAC Card's trusted CA chain (owner, 21 Sep 2026).

   The live console's "Add trusted CA or certificate chain (.pem format)" dialog,
   opened here from an Upload CA chain button on the CAC Card row, as a slider
   rather than a centred dialog (see "slider pages over centred modals").

   Two fields, both required: an alias, and the chain itself as a PEM file. The
   file is read in the browser and never leaves it — this prototype has nowhere
   to send it, and pretending otherwise would be a form that looks like it
   works. After a real upload, miniOrange support enables the chain, which is
   why the slider says so rather than claiming the chain is live.
   -------------------------------------------------------------------------- */

/** The one method whose row carries Upload CA chain. */
export const CA_CHAIN_METHOD_ID = 'cac'

export const takesCaChain = (m: Pick<AuthMethod, 'id'>): boolean => m.id === CA_CHAIN_METHOD_ID

/** What the file chooser offers. PEM text is what counts; .crt and .cer are often PEM too. */
export const CA_FILE_ACCEPT = '.pem,.crt,.cer'

export const isCaFileName = (name: string): boolean => /\.(pem|crt|cer)$/i.test(name.trim())

/** How many PEM certificates a file holds. A chain is one or more. */
export const pemCertCount = (text: string): number => (text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length

/** Why a chosen file cannot be used, or null. Checked when it is chosen, not on Upload. */
export function caFileIssue(name: string, text: string): string | null {
  if (!isCaFileName(name)) return 'Choose a .pem, .crt or .cer file.'
  if (pemCertCount(text) === 0) return 'No PEM certificate found in this file.'
  return null
}

/** Why Upload is not on offer yet, or null — the button's title says it. */
export function caUploadBlocker(alias: string, fileName: string | null): string | null {
  const noAlias = alias.trim() === ''
  if (noAlias && !fileName) return 'Enter an alias and choose a certificate file.'
  if (noAlias) return 'Enter an alias.'
  if (!fileName) return 'Choose a certificate file.'
  return null
}
