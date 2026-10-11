// Deterministic allergen safety check — pure logic, no AI, no I/O.
//
// ⚠️ WICHTIG – FACHLICHE PRÜFUNG ERFORDERLICH:
// Diese Keyword-Listen (KEYWORDS, EXCEPTIONS, SUBSTITUTE_SYNONYMS) basieren auf
// den 14 EU-Hauptallergenen (VO (EU) Nr. 1169/2011) sowie versteckten Quellen
// gemäß DAAB (Deutscher Allergie- und Asthmabund) und Deutscher Zöliakie-Gesellschaft.
// Sie stellen KEINE medizinische oder rechtliche Beratung dar und MÜSSEN vor dem
// Produktions-Launch von einer Fachkraft (Ernährungsberatung, Allergologie) geprüft
// werden. Insbesondere Sulfite, Lupinen und Weichtiere sind in Rezeptzutaten oft
// nicht explizit ausgewiesen – Betroffene müssen stets die Packungsangaben lesen.

// ─── Canonical allergen names ─────────────────────────────────────────────────
// Mirrors stored values in FamilyMember.allergien[] (see lib/allergenOptions.ts).
// 'Milcheiweiß' is a stricter variant for milk-protein allergy vs. lactose intolerance.
// 'Meeresfrüchte' is kept for backward compatibility (pre-EU-14 split).
export type CanonicalAllergen =
  | 'Gluten' | 'Laktose' | 'Milcheiweiß'
  | 'Eier' | 'Erdnüsse' | 'Nüsse' | 'Soja'
  | 'Fisch' | 'Krebstiere' | 'Weichtiere' | 'Meeresfrüchte'
  | 'Sellerie' | 'Senf' | 'Sesam' | 'Lupinen' | 'Sulfite'
  | 'Fleisch'

const CANONICAL: readonly CanonicalAllergen[] = [
  'Gluten', 'Laktose', 'Milcheiweiß',
  'Eier', 'Erdnüsse', 'Nüsse', 'Soja',
  'Fisch', 'Krebstiere', 'Weichtiere', 'Meeresfrüchte',
  'Sellerie', 'Senf', 'Sesam', 'Lupinen', 'Sulfite',
  'Fleisch',
]

// ─── Synonym normalization ────────────────────────────────────────────────────
// Maps lowercase free-text entries to canonical allergen names.
// 'milch' → 'Laktose' (intolerance, laktosefrei substitute is valid).
// 'milcheiweiß' → stricter milk-protein allergy (only vegan/milchfrei accepted).
const SYNONYMS: Record<string, CanonicalAllergen> = {
  // Laktose group (intolerance)
  'laktose': 'Laktose', 'milch': 'Laktose', 'milchzucker': 'Laktose',
  'laktoseintoleranz': 'Laktose', 'milchunverträglichkeit': 'Laktose',
  // Milcheiweiß group (allergy — stricter)
  'milcheiweiß': 'Milcheiweiß', 'milchallergie': 'Milcheiweiß',
  'kuhmilchallergie': 'Milcheiweiß', 'milcheiweißallergie': 'Milcheiweiß',
  // Gluten group
  'gluten': 'Gluten', 'weizen': 'Gluten', 'weizenallergie': 'Gluten',
  'glutenunverträglichkeit': 'Gluten', 'zöliakie': 'Gluten',
  // Nüsse / Erdnüsse
  'nuss': 'Nüsse', 'nüsse': 'Nüsse', 'baumnüsse': 'Nüsse', 'schalenfrüchte': 'Nüsse',
  'erdnüsse': 'Erdnüsse', 'erdnuss': 'Erdnüsse', 'erdnussallergie': 'Erdnüsse', 'peanut': 'Erdnüsse',
  // Eier
  'eier': 'Eier', 'ei': 'Eier', 'hühnerei': 'Eier',
  // Fisch / Meeresfrüchte
  'fisch': 'Fisch',
  'meeresfrüchte': 'Meeresfrüchte',
  'krebstiere': 'Krebstiere', 'krustentiere': 'Krebstiere', 'schalentiere': 'Krebstiere',
  'weichtiere': 'Weichtiere', 'mollusken': 'Weichtiere',
  // Soja
  'soja': 'Soja',
  // EU-14 neue
  'sellerie': 'Sellerie', 'sellerieunverträglichkeit': 'Sellerie',
  'senf': 'Senf', 'senfunverträglichkeit': 'Senf', 'mostrich': 'Senf',
  'sesam': 'Sesam', 'sesamunverträglichkeit': 'Sesam',
  'lupinen': 'Lupinen', 'lupine': 'Lupinen',
  'sulfite': 'Sulfite', 'schwefeldioxid': 'Sulfite', 'so2': 'Sulfite',
  'sulfit': 'Sulfite', 'sulphite': 'Sulfite',
  // Ernährungsweise
  'fleisch': 'Fleisch',
}

export function normalizeAllergen(raw: string): CanonicalAllergen | null {
  const lower = raw.toLowerCase().trim()
  if (lower in SYNONYMS) return SYNONYMS[lower]
  return (CANONICAL.find(c => c.toLowerCase() === lower) ?? null) as CanonicalAllergen | null
}

// ─── Allergen keywords ────────────────────────────────────────────────────────
// Substrings that, if found in a lowercase ingredient name, indicate the allergen.
// Exception list below overrides these for known-safe items.
const KEYWORDS: Record<CanonicalAllergen, string[]> = {
  'Gluten': [
    'weizen', 'dinkel', 'roggen', 'gerste', 'hafer',
    'mehl',
    'paniermehl', 'semmelbrösel', 'semmelmehl', 'panade',
    'nudeln', 'spaghetti', 'tagliatelle', 'penne', 'rigatoni', 'fusilli', 'farfalle', 'pasta',
    'brot', 'brötchen', 'baguette', 'pita', 'wrap', 'tortilla',
    'couscous', 'bulgur',
    'sojasauce', 'austernsauce', 'worcestersauce', 'teriyakisauce',
    'bier',
    'brühe', 'gemüsebrühe', 'hühnerbrühe', 'rinderbrühe', 'brühwürfel', 'fond',
  ],
  'Laktose': [
    'butter', 'sahne', 'käse', 'mozzarella', 'parmesan', 'feta', 'joghurt', 'milch',
    'schmand', 'crème fraîche', 'creme fraiche', 'frischkäse', 'quark', 'ricotta',
    'mascarpone', 'béchamel', 'bechamel', 'gratin', 'kondensmilch',
  ],
  'Milcheiweiß': [
    // Same triggers as Laktose — substitute markers are stricter (laktosefrei ≠ milchfrei).
    'butter', 'sahne', 'käse', 'mozzarella', 'parmesan', 'feta', 'joghurt', 'milch',
    'schmand', 'crème fraîche', 'creme fraiche', 'frischkäse', 'quark', 'ricotta',
    'mascarpone', 'béchamel', 'bechamel', 'gratin', 'kondensmilch',
  ],
  'Eier':         ['eier', 'eigelb', 'eiweiß', 'mayonnaise', 'mayo'],
  'Erdnüsse':     ['erdnuss', 'erdnüsse', 'satay', 'groundnut'],
  'Nüsse': [
    'mandel', 'haselnuss', 'haselnüsse', 'walnuss', 'walnüsse', 'cashew',
    'pistazie', 'macadamia', 'pekan', 'paranuss', 'nussmix', 'nussmus', 'pesto',
    'praline', 'marzipan',
  ],
  'Soja':         ['soja', 'tofu', 'edamame', 'miso', 'tempeh'],
  'Fisch': [
    'lachs', 'thunfisch', 'tuna', 'kabeljau', 'forelle', 'hering',
    'sardine', 'sardellen', 'anchovis', 'tilapia', 'dorsch', 'makrele',
    'seelachs', 'scholle', 'zander', 'barsch', 'rotbarsch',
  ],
  'Krebstiere':   ['garnele', 'shrimp', 'prawn', 'hummer', 'languste', 'krabbe', 'krebse'],
  'Weichtiere':   ['muschel', 'jakobsmuschel', 'auster', 'tintenfisch', 'krake', 'oktopus', 'schnecke'],
  'Meeresfrüchte': [
    // Rückwärtskompatibel: umfasst Krebstiere + Weichtiere + Kaviar
    'garnele', 'shrimp', 'prawn', 'tintenfisch', 'muschel',
    'jakobsmuschel', 'hummer', 'languste', 'kaviar', 'krabbe', 'auster',
  ],
  'Sellerie':     ['sellerie'],
  'Senf':         ['senf', 'mostrich'],
  'Sesam':        ['sesam', 'tahini'],
  'Lupinen':      ['lupine', 'lupinenmehl'],
  'Sulfite': [
    'wein', 'weinessig', 'balsamico',
    'rosinen', 'sultaninen', 'dörrpflaume', 'trockenfrüchte', 'trockenobst',
    'getrocknete aprikosen',
  ],
  'Fleisch': [
    'hähnchen', 'hühnchen', 'pute', 'truthahn', 'ente', 'gans',
    'schwein', 'rind', 'lamm', 'kalb',
    'speck', 'schinken', 'wurst', 'hackfleisch',
    'salami', 'chorizo', 'pancetta', 'bacon',
  ],
}

// ─── Exceptions (never flagged) ───────────────────────────────────────────────
// Ingredients containing these strings are safe for the listed allergen
// even if a keyword matches (e.g. "Reisnudeln" contains "nudeln" but is gluten-free).
// Cross-allergen: Mandelmilch still triggers 'Nüsse', Hafermilch still triggers 'Gluten'.
const EXCEPTIONS: Record<CanonicalAllergen, string[]> = {
  'Gluten': [
    'reisnudeln', 'glasnudeln',
    'reismehl', 'maismehl', 'kichererbsenmehl',
    'buchweizenmehl', 'buchweizennudeln', 'buchweizen',
    'hirse', 'quinoa',
  ],
  'Laktose': [
    'kokosmilch', 'kokossahne', 'kokosnussmilch',
    'mandelmilch', 'hafermilch', 'sojamilch', 'reismilch', 'erbsenmilch', 'cashewmilch', 'dinkelmilch',
    'sojajoghurt', 'kokosjoghurt', 'haferjoghurt', 'mandeljoghurt',
    'erdnussbutter', 'erdnussmus',
    'mandelbutter', 'cashewbutter', 'haselnussbutter', 'mandelmus',
    'kakaobutter',
  ],
  'Milcheiweiß': [
    'kokosmilch', 'kokossahne', 'kokosnussmilch',
    'mandelmilch', 'hafermilch', 'sojamilch', 'reismilch', 'erbsenmilch', 'cashewmilch', 'dinkelmilch',
    'sojajoghurt', 'kokosjoghurt', 'haferjoghurt', 'mandeljoghurt',
    'erdnussbutter', 'erdnussmus',
    'mandelbutter', 'cashewbutter', 'haselnussbutter', 'mandelmus',
    'kakaobutter',
  ],
  'Eier':         ['eierschwammerl'],
  'Erdnüsse':     [],
  'Nüsse':        [],
  'Soja':         [],
  'Fisch':        [],
  'Krebstiere':   [],
  'Weichtiere':   [],
  'Meeresfrüchte': [],
  'Sellerie':     [],
  'Senf':         [],
  'Sesam':        [],
  'Lupinen':      [],
  // Fresh grapes ≠ sulfites (only dried/processed forms contain relevant levels)
  'Sulfite':      ['weintrauben', 'weintomaten'],
  'Fleisch':      [],
}

// ─── Substitute markers ───────────────────────────────────────────────────────
// If ANY of these substrings appears in an ingredient name, the allergen trigger
// is neutralised (this IS already the allergen-safe version).
// 'laktosefrei' neutralises 'Laktose' but NOT 'Milcheiweiß' (milk-protein allergy).
const SUBSTITUTES: Record<CanonicalAllergen, string[]> = {
  'Gluten':       ['glutenfrei', 'gluten-frei'],
  'Laktose':      ['laktosefrei', 'laktose-frei', 'ohne laktose', 'pflanzlich', 'vegan', 'milchfrei'],
  'Milcheiweiß':  ['pflanzlich', 'vegan', 'milchfrei'],  // laktosefrei is NOT sufficient
  'Eier':         ['vegan', 'ei-ersatz'],
  'Erdnüsse':     [],
  'Nüsse':        [],
  'Soja':         [],
  'Fisch':        [],
  'Krebstiere':   ['vegan', 'pflanzlich'],
  'Weichtiere':   ['vegan', 'pflanzlich'],
  'Meeresfrüchte': ['vegan', 'pflanzlich'],
  'Sellerie':     ['selleriefreiheit', 'ohne sellerie'],
  'Senf':         ['senffreiheit', 'ohne senf'],
  'Sesam':        ['sesam-frei', 'sesamfrei', 'ohne sesam'],
  'Lupinen':      [],
  'Sulfite':      ['ohne schwefeldioxid', 'sulfitfrei', 'schwefelfreiheit'],
  'Fleisch':      ['vegan', 'pflanzlich', 'vegetarisch'],
}

// ─── Substitute synonyms ──────────────────────────────────────────────────────
// Maps known substitute product name fragments → the original ingredients they replace.
// Used when base names don't overlap lexically but the substitution is well-known.
// Example: "Tamari" is a gluten-free substitute for "Sojasauce" but shares no base name.
const SUBSTITUTE_SYNONYMS: Record<string, string[]> = {
  'tamari':                ['sojasauce'],
  'glutenfreie sojasauce': ['sojasauce'],
  'pflanzendrink':         ['milch'],
  'haferdrink':            ['milch'],
  'mandeldrink':           ['milch'],
  'sojadrink':             ['milch'],
  'reisdrink':             ['milch'],
  'hafermilch':            ['milch'],
  'mandelmilch':           ['milch'],
  'sojamilch':             ['milch'],
  'reismilch':             ['milch'],
  'kokosmilch':            ['milch', 'sahne'],
  'kokossahne':            ['sahne'],
  'sojajoghurt':           ['joghurt'],
  'kokosjoghurt':          ['joghurt'],
  'haferjoghurt':          ['joghurt'],
  'mandeljoghurt':         ['joghurt'],
  'margarine':             ['butter'],
  'vegane butter':         ['butter'],
  'pflanzliche butter':    ['butter'],
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CheckMember { name: string; allergien: string[] }
export interface AllergenIssue { person: string; allergen: CanonicalAllergen; zutat: string }

type RezeptLike = { zutaten: { name: string; fuer?: string }[] }

function baseName(name: string): string {
  return name.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

// ─── Main check function ──────────────────────────────────────────────────────
// Per-ingredient rule: an ingredient is only "solved" for person P when there is
// a fuer=P ingredient that specifically substitutes THAT ingredient (not just
// any ingredient of the same allergen category).
export function checkAllergens(rezept: RezeptLike, presentMembers: CheckMember[]): AllergenIssue[] {
  const membersWithAllergies = presentMembers
    .map(m => ({
      name: m.name,
      allergien: m.allergien
        .map(normalizeAllergen)
        .filter((a): a is CanonicalAllergen => a !== null),
    }))
    .filter(m => m.allergien.length > 0)

  if (membersWithAllergies.length === 0) return []

  const issues: AllergenIssue[] = []

  for (const zutat of rezept.zutaten) {
    if (zutat.fuer) continue  // already an adapted substitute — skip

    const nameLower = zutat.name.toLowerCase()
    const nameBase = baseName(zutat.name)

    for (const allergen of CANONICAL) {
      const keywords = KEYWORDS[allergen]
      const exceptions = EXCEPTIONS[allergen]
      const substitutes = SUBSTITUTES[allergen]

      // 1. Exception overrides keyword (e.g. "Reisnudeln" contains "nudeln" but is fine)
      if (exceptions.some(ex => nameLower.includes(ex))) continue

      // 2. Keyword match
      if (!keywords.some(k => nameLower.includes(k))) continue

      // 3. Ingredient already carries a substitute marker ("glutenfrei", "laktosefrei", …)
      if (substitutes.some(s => nameLower.includes(s))) continue

      // 4. Check each affected present member
      for (const member of membersWithAllergies) {
        if (!member.allergien.includes(allergen)) continue

        // 5. Is there a fuer=member ingredient that covers THIS SPECIFIC ingredient?
        const solved = rezept.zutaten.some(z => {
          if (z.fuer !== member.name) return false
          const fl = z.name.toLowerCase()
          const fb = baseName(z.name)

          // A: base names overlap (e.g. "Mozzarella" ↔ "Mozzarella (laktosefrei)")
          if (fb.includes(nameBase) || nameBase.includes(fb)) return true

          // B: fuer-ingredient triggers the same allergen keyword AND carries substitute markers
          //    (e.g. "Sojasauce (glutenfrei)" explicitly covers "Sojasauce")
          const fueTriggers = keywords.some(k => fl.includes(k))
          const fueHasSub = substitutes.some(s => fl.includes(s))
          const fueIsExcept = exceptions.some(ex => fl.includes(ex))
          if (fueTriggers && (fueHasSub || fueIsExcept)) return true

          // C: substitute synonym table — e.g. "Tamari" is a known sub for "Sojasauce"
          return Object.entries(SUBSTITUTE_SYNONYMS).some(
            ([syn, targets]) =>
              fl.includes(syn) && targets.some(t => nameBase.includes(t) || t.includes(nameBase)),
          )
        })

        if (!solved) issues.push({ person: member.name, allergen, zutat: zutat.name })
      }
    }
  }

  // Deduplicate
  return issues.filter(
    (v, i, a) => a.findIndex(x => x.person === v.person && x.allergen === v.allergen && x.zutat === v.zutat) === i,
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatAllergenWarnings(issues: AllergenIssue[]): string[] {
  return issues.map(i => `${i.zutat} → ${i.allergen} (${i.person})`)
}

export function buildAllergenRetryHint(issues: AllergenIssue[]): string {
  const grouped: Record<string, string[]> = {}
  for (const i of issues) {
    const key = `${i.person} (${i.allergen})`;
    (grouped[key] ??= []).push(i.zutat)
  }
  return Object.entries(grouped).map(([k, z]) => `${k}: ${z.join(', ')}`).join('; ')
}
