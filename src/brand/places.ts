/* -----------------------------------------------------------------------------
   Places, and a search over them.

   A zone's location section is three string arrays — countries, states, cities —
   and until now the only way to fill them was seven hardcoded country names and
   seven city names rendered as flat rows of buttons, with no states at all. That
   is a picker for a demo, not for a tenant: it cannot express "Maharashtra", it
   cannot be searched, and it silently implies the world contains seven countries.

   This is the catalogue behind a real search. It is deliberately hierarchical —
   a city knows its state and its country — because that context is what makes a
   result row readable ("Pune · Maharashtra, India") and what lets the zone
   editor notice that adding Pune to a zone that already contains India changes
   nothing.

   Coordinates are approximate centroids, to one decimal place. They are here for
   the radius option in ZoneLocation and for ordering, not for cartography.

   It is a prototype catalogue: broad enough that typing almost anything finds
   something, small enough to read. A real console would query this server-side.
   -------------------------------------------------------------------------- */

export type PlaceKind = 'country' | 'state' | 'city'

export interface Place {
  /** Stable and hierarchical: 'in', 'in-mh', 'in-mh-pune'. */
  id: string
  kind: PlaceKind
  name: string
  /** Display name of the country this sits in. A country's own country is itself. */
  country: string
  /** Only on cities that have one. */
  state?: string
  lat: number
  lon: number
  /** Spellings and abbreviations people actually type. */
  aliases?: string[]
}

interface City {
  name: string
  lat: number
  lon: number
  aliases?: string[]
}
interface State {
  name: string
  lat: number
  lon: number
  aliases?: string[]
  cities?: City[]
}
interface Country {
  name: string
  iso2: string
  lat: number
  lon: number
  aliases?: string[]
  states?: State[]
}

/* Coverage is weighted towards where this product is sold and operated rather
   than towards population: India in depth because that is the home market, the
   US and Europe because that is where the enterprise tenants are, and a spread
   of APAC and the Gulf because that is where the travel exceptions come from. */
const WORLD: Country[] = [
  {
    name: 'India',
    iso2: 'in',
    lat: 22.6,
    lon: 78.9,
    aliases: ['bharat'],
    states: [
      {
        name: 'Maharashtra',
        lat: 19.7,
        lon: 75.7,
        cities: [
          { name: 'Pune', lat: 18.5, lon: 73.9, aliases: ['poona'] },
          { name: 'Mumbai', lat: 19.1, lon: 72.9, aliases: ['bombay'] },
          { name: 'Nagpur', lat: 21.1, lon: 79.1 },
          { name: 'Nashik', lat: 20.0, lon: 73.8 },
        ],
      },
      {
        name: 'Karnataka',
        lat: 15.3,
        lon: 75.7,
        cities: [
          { name: 'Bengaluru', lat: 13.0, lon: 77.6, aliases: ['bangalore', 'blr'] },
          { name: 'Mysuru', lat: 12.3, lon: 76.6, aliases: ['mysore'] },
          { name: 'Mangaluru', lat: 12.9, lon: 74.9, aliases: ['mangalore'] },
        ],
      },
      {
        name: 'Telangana',
        lat: 17.9,
        lon: 79.6,
        cities: [{ name: 'Hyderabad', lat: 17.4, lon: 78.5, aliases: ['hyd'] }],
      },
      {
        name: 'Tamil Nadu',
        lat: 11.1,
        lon: 78.7,
        cities: [
          { name: 'Chennai', lat: 13.1, lon: 80.3, aliases: ['madras'] },
          { name: 'Coimbatore', lat: 11.0, lon: 76.9 },
        ],
      },
      {
        name: 'Delhi',
        lat: 28.7,
        lon: 77.1,
        aliases: ['ncr', 'national capital territory'],
        cities: [{ name: 'New Delhi', lat: 28.6, lon: 77.2 }],
      },
      {
        name: 'Haryana',
        lat: 29.1,
        lon: 76.1,
        cities: [
          { name: 'Gurugram', lat: 28.5, lon: 77.0, aliases: ['gurgaon'] },
          { name: 'Faridabad', lat: 28.4, lon: 77.3 },
        ],
      },
      {
        name: 'Uttar Pradesh',
        lat: 26.8,
        lon: 80.9,
        aliases: ['up'],
        cities: [
          { name: 'Noida', lat: 28.5, lon: 77.4 },
          { name: 'Lucknow', lat: 26.8, lon: 80.9 },
        ],
      },
      {
        name: 'West Bengal',
        lat: 22.9,
        lon: 87.9,
        cities: [{ name: 'Kolkata', lat: 22.6, lon: 88.4, aliases: ['calcutta'] }],
      },
      {
        name: 'Gujarat',
        lat: 22.3,
        lon: 71.2,
        cities: [
          { name: 'Ahmedabad', lat: 23.0, lon: 72.6 },
          { name: 'Surat', lat: 21.2, lon: 72.8 },
        ],
      },
      { name: 'Kerala', lat: 10.9, lon: 76.3, cities: [{ name: 'Kochi', lat: 10.0, lon: 76.3, aliases: ['cochin'] }] },
      { name: 'Rajasthan', lat: 27.0, lon: 74.2, cities: [{ name: 'Jaipur', lat: 26.9, lon: 75.8 }] },
    ],
  },
  {
    name: 'United States',
    iso2: 'us',
    lat: 39.8,
    lon: -98.6,
    aliases: ['usa', 'us', 'america', 'united states of america'],
    states: [
      {
        name: 'California',
        lat: 36.8,
        lon: -119.4,
        aliases: ['ca'],
        cities: [
          { name: 'San Francisco', lat: 37.8, lon: -122.4, aliases: ['sf'] },
          { name: 'San Jose', lat: 37.3, lon: -121.9 },
          { name: 'Los Angeles', lat: 34.1, lon: -118.2, aliases: ['la'] },
          { name: 'San Diego', lat: 32.7, lon: -117.2 },
        ],
      },
      {
        name: 'Texas',
        lat: 31.0,
        lon: -99.9,
        aliases: ['tx'],
        cities: [
          { name: 'Austin', lat: 30.3, lon: -97.7 },
          { name: 'Dallas', lat: 32.8, lon: -96.8 },
          { name: 'Houston', lat: 29.8, lon: -95.4 },
        ],
      },
      {
        name: 'New York',
        lat: 43.0,
        lon: -75.0,
        aliases: ['ny'],
        cities: [{ name: 'New York City', lat: 40.7, lon: -74.0, aliases: ['nyc', 'manhattan'] }],
      },
      {
        name: 'Washington',
        lat: 47.4,
        lon: -120.7,
        aliases: ['wa'],
        cities: [{ name: 'Seattle', lat: 47.6, lon: -122.3 }],
      },
      { name: 'Illinois', lat: 40.0, lon: -89.0, aliases: ['il'], cities: [{ name: 'Chicago', lat: 41.9, lon: -87.6 }] },
      {
        name: 'Massachusetts',
        lat: 42.4,
        lon: -71.4,
        aliases: ['ma'],
        cities: [{ name: 'Boston', lat: 42.4, lon: -71.1 }],
      },
      { name: 'Florida', lat: 27.8, lon: -81.7, aliases: ['fl'], cities: [{ name: 'Miami', lat: 25.8, lon: -80.2 }] },
      {
        name: 'Colorado',
        lat: 39.1,
        lon: -105.4,
        aliases: ['co'],
        cities: [{ name: 'Denver', lat: 39.7, lon: -105.0 }],
      },
    ],
  },
  {
    name: 'United Kingdom',
    iso2: 'gb',
    lat: 54.0,
    lon: -2.0,
    aliases: ['uk', 'britain', 'great britain', 'gb'],
    states: [
      {
        name: 'England',
        lat: 52.4,
        lon: -1.5,
        cities: [
          { name: 'London', lat: 51.5, lon: -0.1 },
          { name: 'Manchester', lat: 53.5, lon: -2.2 },
          { name: 'Birmingham', lat: 52.5, lon: -1.9 },
          { name: 'Bristol', lat: 51.5, lon: -2.6 },
        ],
      },
      { name: 'Scotland', lat: 56.5, lon: -4.2, cities: [{ name: 'Edinburgh', lat: 56.0, lon: -3.2 }, { name: 'Glasgow', lat: 55.9, lon: -4.3 }] },
      { name: 'Wales', lat: 52.1, lon: -3.8, cities: [{ name: 'Cardiff', lat: 51.5, lon: -3.2 }] },
      { name: 'Northern Ireland', lat: 54.8, lon: -6.5, cities: [{ name: 'Belfast', lat: 54.6, lon: -5.9 }] },
    ],
  },
  {
    name: 'Germany',
    iso2: 'de',
    lat: 51.2,
    lon: 10.4,
    aliases: ['deutschland'],
    states: [
      { name: 'Bavaria', lat: 48.8, lon: 11.4, aliases: ['bayern'], cities: [{ name: 'Munich', lat: 48.1, lon: 11.6, aliases: ['munchen', 'münchen'] }, { name: 'Nuremberg', lat: 49.5, lon: 11.1 }] },
      { name: 'Berlin', lat: 52.5, lon: 13.4, cities: [{ name: 'Berlin', lat: 52.5, lon: 13.4 }] },
      { name: 'Hesse', lat: 50.7, lon: 9.0, aliases: ['hessen'], cities: [{ name: 'Frankfurt', lat: 50.1, lon: 8.7 }] },
      { name: 'Hamburg', lat: 53.6, lon: 10.0, cities: [{ name: 'Hamburg', lat: 53.6, lon: 10.0 }] },
    ],
  },
  {
    name: 'France',
    iso2: 'fr',
    lat: 46.6,
    lon: 2.2,
    states: [
      { name: 'Île-de-France', lat: 48.8, lon: 2.5, aliases: ['ile de france'], cities: [{ name: 'Paris', lat: 48.9, lon: 2.4 }] },
      { name: 'Auvergne-Rhône-Alpes', lat: 45.5, lon: 4.5, cities: [{ name: 'Lyon', lat: 45.8, lon: 4.8 }] },
      { name: "Provence-Alpes-Côte d'Azur", lat: 43.9, lon: 6.1, cities: [{ name: 'Marseille', lat: 43.3, lon: 5.4 }, { name: 'Nice', lat: 43.7, lon: 7.3 }] },
    ],
  },
  {
    name: 'Netherlands',
    iso2: 'nl',
    lat: 52.1,
    lon: 5.3,
    aliases: ['holland'],
    states: [
      { name: 'North Holland', lat: 52.6, lon: 4.8, cities: [{ name: 'Amsterdam', lat: 52.4, lon: 4.9 }] },
      { name: 'South Holland', lat: 52.0, lon: 4.5, cities: [{ name: 'Rotterdam', lat: 51.9, lon: 4.5 }, { name: 'The Hague', lat: 52.1, lon: 4.3 }] },
    ],
  },
  {
    name: 'Ireland',
    iso2: 'ie',
    lat: 53.4,
    lon: -8.2,
    aliases: ['eire'],
    states: [{ name: 'Leinster', lat: 53.3, lon: -6.9, cities: [{ name: 'Dublin', lat: 53.3, lon: -6.3 }] }],
  },
  { name: 'Singapore', iso2: 'sg', lat: 1.4, lon: 103.8, states: [{ name: 'Singapore', lat: 1.4, lon: 103.8, cities: [{ name: 'Singapore', lat: 1.3, lon: 103.9 }] }] },
  {
    name: 'Australia',
    iso2: 'au',
    lat: -25.3,
    lon: 133.8,
    aliases: ['aus'],
    states: [
      { name: 'New South Wales', lat: -31.3, lon: 146.9, aliases: ['nsw'], cities: [{ name: 'Sydney', lat: -33.9, lon: 151.2 }] },
      { name: 'Victoria', lat: -37.0, lon: 144.3, aliases: ['vic'], cities: [{ name: 'Melbourne', lat: -37.8, lon: 145.0 }] },
      { name: 'Queensland', lat: -22.6, lon: 144.3, aliases: ['qld'], cities: [{ name: 'Brisbane', lat: -27.5, lon: 153.0 }] },
    ],
  },
  {
    name: 'Canada',
    iso2: 'ca',
    lat: 56.1,
    lon: -106.3,
    states: [
      { name: 'Ontario', lat: 51.3, lon: -85.3, cities: [{ name: 'Toronto', lat: 43.7, lon: -79.4 }, { name: 'Ottawa', lat: 45.4, lon: -75.7 }] },
      { name: 'British Columbia', lat: 53.7, lon: -127.6, aliases: ['bc'], cities: [{ name: 'Vancouver', lat: 49.3, lon: -123.1 }] },
      { name: 'Quebec', lat: 52.9, lon: -73.5, cities: [{ name: 'Montreal', lat: 45.5, lon: -73.6 }] },
    ],
  },
  {
    name: 'Japan',
    iso2: 'jp',
    lat: 36.2,
    lon: 138.3,
    states: [
      { name: 'Tokyo', lat: 35.7, lon: 139.7, cities: [{ name: 'Tokyo', lat: 35.7, lon: 139.7 }] },
      { name: 'Osaka', lat: 34.7, lon: 135.5, cities: [{ name: 'Osaka', lat: 34.7, lon: 135.5 }] },
    ],
  },
  {
    name: 'United Arab Emirates',
    iso2: 'ae',
    lat: 24.0,
    lon: 54.0,
    aliases: ['uae', 'emirates'],
    states: [
      { name: 'Dubai', lat: 25.1, lon: 55.3, cities: [{ name: 'Dubai', lat: 25.2, lon: 55.3 }] },
      { name: 'Abu Dhabi', lat: 24.4, lon: 54.4, cities: [{ name: 'Abu Dhabi', lat: 24.5, lon: 54.4 }] },
    ],
  },
  {
    name: 'Philippines',
    iso2: 'ph',
    lat: 12.9,
    lon: 121.8,
    states: [{ name: 'Metro Manila', lat: 14.6, lon: 121.0, cities: [{ name: 'Manila', lat: 14.6, lon: 121.0 }, { name: 'Cebu City', lat: 10.3, lon: 123.9 }] }],
  },
  {
    name: 'Brazil',
    iso2: 'br',
    lat: -14.2,
    lon: -51.9,
    states: [
      { name: 'São Paulo', lat: -23.5, lon: -46.6, aliases: ['sao paulo'], cities: [{ name: 'São Paulo', lat: -23.6, lon: -46.6, aliases: ['sao paulo'] }] },
      { name: 'Rio de Janeiro', lat: -22.9, lon: -43.2, cities: [{ name: 'Rio de Janeiro', lat: -22.9, lon: -43.2, aliases: ['rio'] }] },
    ],
  },
  {
    name: 'South Africa',
    iso2: 'za',
    lat: -30.6,
    lon: 22.9,
    states: [
      { name: 'Gauteng', lat: -26.3, lon: 28.1, cities: [{ name: 'Johannesburg', lat: -26.2, lon: 28.0, aliases: ['joburg'] }] },
      { name: 'Western Cape', lat: -33.2, lon: 21.9, cities: [{ name: 'Cape Town', lat: -33.9, lon: 18.4 }] },
    ],
  },
]

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/* Flattened once at module load. Everything downstream — search, lookup, the
   redundancy check — reads this single list, so there is one definition of what
   a place is and nothing can drift. */
export const PLACES: Place[] = (() => {
  const out: Place[] = []
  for (const c of WORLD) {
    out.push({ id: c.iso2, kind: 'country', name: c.name, country: c.name, lat: c.lat, lon: c.lon, aliases: c.aliases })
    for (const s of c.states ?? []) {
      const sid = `${c.iso2}-${slug(s.name)}`
      out.push({ id: sid, kind: 'state', name: s.name, country: c.name, lat: s.lat, lon: s.lon, aliases: s.aliases })
      for (const t of s.cities ?? []) {
        out.push({
          id: `${sid}-${slug(t.name)}`,
          kind: 'city',
          name: t.name,
          country: c.name,
          state: s.name,
          lat: t.lat,
          lon: t.lon,
          aliases: t.aliases,
        })
      }
    }
  }
  return out
})()

/** "Maharashtra, India" for a city; "India" for a country. What sits under the name. */
export function placeContext(p: Place): string {
  if (p.kind === 'country') return 'Country'
  if (p.kind === 'state') return `State · ${p.country}`
  return `City · ${p.state ? `${p.state}, ` : ''}${p.country}`
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

/* Ranked, not filtered.

   A query like "sing" matches the country Singapore, the state Singapore and
   the city Singapore, and a flat filter would show all three in load order and
   let the admin pick whichever came first. Rank is: exact name, then name
   prefix, then alias hit, then substring — and within a tie, the broader place
   first, because someone typing three letters is far more often after a country
   than a city inside one. */
export function searchPlaces(query: string, limit = 12): Place[] {
  const q = norm(query)
  if (!q) return []

  const scored: { p: Place; score: number }[] = []
  for (const p of PLACES) {
    const name = norm(p.name)
    let score = -1
    if (name === q) score = 0
    else if (name.startsWith(q)) score = 1
    else if (p.aliases?.some((a) => norm(a) === q)) score = 2
    else if (p.aliases?.some((a) => norm(a).startsWith(q))) score = 3
    else if (name.includes(q)) score = 4
    /* Context matches last and only for cities: typing "maharashtra" should
       surface the state itself first and still offer the cities inside it. */
    else if (p.kind === 'city' && (norm(p.state ?? '').startsWith(q) || norm(p.country).startsWith(q))) score = 5
    if (score >= 0) scored.push({ p, score })
  }

  const breadth: Record<PlaceKind, number> = { country: 0, state: 1, city: 2 }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      breadth[a.p.kind] - breadth[b.p.kind] ||
      a.p.name.length - b.p.name.length ||
      a.p.name.localeCompare(b.p.name),
  )
  return scored.slice(0, limit).map((s) => s.p)
}

export const placeById = (id: string) => PLACES.find((p) => p.id === id)

/* Adding Pune to a zone that already contains India does not narrow it and does
   not widen it — the sections within a location are ORed, so the country
   already covers the city. Worth saying, because it looks like it did
   something. Returns the covering place, or null. */
export function coveredBy(
  p: Place,
  chosen: { countries: string[]; states: string[]; cities: string[] },
): string | null {
  if (p.kind !== 'country' && chosen.countries.includes(p.country)) return p.country
  if (p.kind === 'city' && p.state && chosen.states.includes(p.state)) return p.state
  return null
}
