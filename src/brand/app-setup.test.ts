import { describe, expect, it } from 'vitest'

import {
  AUTHN_CONTEXTS,
  NAME_ID_FORMATS,
  PROFILE_ATTRS,
  authnContextLabel,
  basicIssues,
  cleanSetup,
  defaultOidc,
  defaultSaml,
  fakeHex,
  idpValues,
  isUrl,
  logoBase,
  nameIdFormatLabel,
  profileAttrLabel,
  setupChanges,
  setupOf,
  shownOnDashboard,
} from './app-setup'
import { showcaseTenant } from './fixtures'

describe('the live defaults', () => {
  it('signs the response and nothing else, as the live SAML form starts', () => {
    const s = defaultSaml()
    expect([s.signedRequest, s.signResponse, s.signAssertion, s.encryptAssertion]).toEqual([false, true, false, false])
    expect(s.signatureAlgorithm).toBe('RSA-SHA256')
    expect(s.logoutResponseBinding).toBe('HTTP-POST')
    expect(s.idpLogoutRequestBinding).toBe('HTTP-Redirect')
    expect(s.validityPeriod).toBe(300)
    expect(authnContextLabel(s.authnContext)).toBe('PasswordProtectedTransport')
    expect(s.showOnDashboard).toBe(true)
  })

  it('expires OAuth tokens after 1 hour, 1 hour and 14 days, and starts off the dashboard', () => {
    const o = defaultOidc('abc')
    expect([o.accessTokenHours, o.idTokenHours, o.refreshTokenDays]).toEqual([1, 1, 14])
    expect(o.showOnDashboard).toBe(false)
    expect(o.clientId).toBe('abc')
  })

  it('offers the default AuthnContext class among its choices', () => {
    expect(AUTHN_CONTEXTS).toContain(defaultSaml().authnContext)
  })
})

describe('setupOf', () => {
  it('gives every showcase application a complete setup of its own protocol', () => {
    for (const app of showcaseTenant().apps) {
      const s = setupOf(app)
      expect(s.kind, app.id).toBe(app.protocol === 'OIDC' ? 'oidc' : 'saml')
      expect(basicIssues(s, app.name, [], app.secret ?? 'x'), app.id).toEqual({})
    }
  })

  it('is the same on every call, and puts a brand under its own domain', () => {
    const sf = { id: 'salesforce', protocol: 'SAML' as const }
    expect(setupOf(sf)).toEqual(setupOf(sf))
    const s = setupOf(sf)
    expect(s.kind === 'saml' && s.acsUrl).toBe('https://acme.salesforce.com/saml/acs')
  })

  it("keeps an application's own setup, and never one of the other protocol", () => {
    const own = { ...defaultSaml(), entityId: 'urn:mine', acsUrl: 'https://x.example/acs' }
    expect(setupOf({ id: 'x', protocol: 'SAML', setup: own })).toBe(own)
    expect(setupOf({ id: 'x', protocol: 'OIDC', setup: own }).kind).toBe('oidc')
  })

  it('reads a numbered application as its catalogue entry', () => {
    expect(logoBase('salesforce-2')).toBe('salesforce')
    expect(logoBase('google-workspace')).toBe('google-workspace')
  })
})

describe('basicIssues', () => {
  const saml = { ...defaultSaml(), entityId: 'https://sp.example/metadata', acsUrl: 'https://sp.example/acs' }

  it('asks for the name, the entity ID and the ACS URL', () => {
    expect(basicIssues(defaultSaml(), '', [], '')).toEqual({
      name: 'Enter a display name.',
      entityId: 'Enter the SP entity ID or issuer.',
      acsUrl: 'Enter the ACS URL.',
    })
  })

  it('wants an https ACS URL, and a URL in the optional fields only when one is typed', () => {
    expect(basicIssues({ ...saml, acsUrl: 'http://sp.example/acs' }, 'A', [], '').acsUrl).toBe('Enter an https URL.')
    expect(basicIssues({ ...saml, sloUrl: 'not a url' }, 'A', [], '').sloUrl).toBe('Enter a URL.')
    expect(basicIssues(saml, 'A', [], '')).toEqual({})
  })

  it('refuses a name another application has, ignoring case and spaces', () => {
    expect(basicIssues(saml, ' salesforce ', ['Salesforce'], '').name).toBe('An application with this name already exists.')
  })

  it('wants a first redirect URL on an OAuth application, and every one to be a URL', () => {
    const o = defaultOidc('id')
    expect(basicIssues(o, 'A', [], 's').redirectUrls).toBe('Enter a redirect URL.')
    expect(basicIssues({ ...o, redirectUrls: ['https://a.example/cb', 'nope'] }, 'A', [], 's').redirectUrls).toBe('Enter each redirect URL as a URL.')
    expect(basicIssues({ ...o, redirectUrls: ['https://a.example/cb', ''] }, 'A', [], 's')).toEqual({})
    expect(basicIssues({ ...o, redirectUrls: ['https://a.example/cb'] }, 'A', [], '').secret).toBe('Regenerate the client secret.')
  })
})

describe('setupChanges', () => {
  it('names each changed field once, in the form order, with before and after and its tab', () => {
    const before = { ...defaultSaml(), acsUrl: 'https://a.example/acs' }
    const after = { ...before, acsUrl: 'https://b.example/acs', signAssertion: true }
    expect(setupChanges(before, after)).toEqual([
      { label: 'ACS URL', before: 'https://a.example/acs', after: 'https://b.example/acs', tab: 'basic' },
      { label: 'Sign assertion', before: 'Off', after: 'On', tab: 'advanced' },
    ])
    expect(setupChanges(before, before)).toEqual([])
  })

  it('reads a blank redirect row as nothing', () => {
    const o = { ...defaultOidc('id'), redirectUrls: ['https://a.example/cb'] }
    expect(setupChanges(o, { ...o, redirectUrls: ['https://a.example/cb', ''] })).toEqual([])
  })

  it('files each field under the tab that asks it', () => {
    const o = defaultOidc('id')
    const tabs = setupChanges(o, { ...o, singleLogout: true, multiValued: true, refreshTokenDays: 30 }).map((c) => [c.label, c.tab])
    expect(tabs).toEqual([
      ['Refresh token expiry (in days)', 'advanced'],
      ['Single logout enabled', 'sign-in'],
      ['Enable multi-valued attributes', 'attributes'],
    ])
  })

  it('says a Name ID format by its readable end, not the whole URN', () => {
    const s = defaultSaml()
    expect(setupChanges(s, { ...s, nameIdFormat: NAME_ID_FORMATS[1] })).toEqual([
      { label: 'Name ID format', before: 'unspecified', after: 'emailAddress', tab: 'attributes' },
    ])
  })
})

describe('cleanSetup', () => {
  it('trims the text and leaves out the rows a form left blank', () => {
    const o = {
      ...defaultOidc('id'),
      redirectUrls: [' https://a.example/cb ', '', '  '],
      logoutUris: [''],
      attributes: [
        { id: 'a', name: ' dept ', value: 'email' as const },
        { id: 'b', name: ' ', value: 'guid' as const },
      ],
    }
    const c = cleanSetup(o)
    expect(c.kind === 'oidc' && c.redirectUrls).toEqual(['https://a.example/cb'])
    expect(c.kind === 'oidc' && c.logoutUris).toEqual([])
    expect(c.attributes).toEqual([{ id: 'a', name: 'dept', value: 'email' }])
    expect(setupChanges(o, c)).toEqual([])
  })

  it('drops a relay state value nobody can see once the kind is None', () => {
    const s = { ...defaultSaml(), entityId: ' urn:sp ', relayState: 'none' as const, relayStateValue: 'left over' }
    const c = cleanSetup(s)
    expect(c.kind === 'saml' && [c.entityId, c.relayStateValue]).toEqual(['urn:sp', ''])
  })
})

describe('what the service provider needs', () => {
  it('lists the SAML values and the OAuth endpoints, on the console host', () => {
    expect(idpValues('saml', 'zendesk').map((v) => v.label)).toEqual(['IdP entity ID', 'SAML sign-in URL', 'SAML sign-out URL', 'Metadata URL'])
    expect(idpValues('oidc', 'oauth', 'abc').map((v) => v.label)).toEqual(['Authorization endpoint', 'Token endpoint', 'User info endpoint', 'Discovery endpoint'])
    for (const v of [...idpValues('saml', 'zendesk'), ...idpValues('oidc', 'oauth', 'abc')]) expect(isUrl(v.value, true), v.label).toBe(true)
  })
})

describe('helpers', () => {
  it('makes the same made-up hex from the same seed, at the length asked', () => {
    expect(fakeHex('a', 32)).toBe(fakeHex('a', 32))
    expect(fakeHex('a', 32)).not.toBe(fakeHex('b', 32))
    expect(fakeHex('a', 32)).toMatch(/^[0-9a-f]{32}$/)
  })

  it('shows an application on the dashboard unless its setup says not to', () => {
    expect(shownOnDashboard(undefined)).toBe(true)
    expect(shownOnDashboard({ ...defaultOidc('x') })).toBe(false)
  })

  it('says Email address, as the console says Email everywhere else', () => {
    expect(profileAttrLabel('email')).toBe('Email address')
    expect(PROFILE_ATTRS.map((p) => p.label).join(' ')).not.toMatch(/E-mail/)
  })

  it('reads every Name ID format by the end of its URN', () => {
    expect(NAME_ID_FORMATS.map(nameIdFormatLabel)).toEqual(['unspecified', 'emailAddress', 'persistent', 'transient'])
  })
})
