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
// Added vs. previous version:
//   Gluten: 'grünkern', 'emmer', 'kamut'  (ancient wheat relatives, all contain gluten)
//   Soja: 'tamari'  (fermented soy sauce, contains soy despite different base name)
const KEYWORDS: Record<CanonicalAllergen, string[]> = {
  'Gluten': [
    'weizen', 'dinkel', 'roggen', 'gerste', 'hafer', 'grünkern', 'emmer', 'kamut',
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
  // 'tamari' added: Tamari is a soy-based sauce — it contains soy despite having no
  // 'soja' in its name. Required for Fix 2 (fuer-ingredient self-check) to work.
  'Soja':         ['soja', 'tofu', 'edamame', 'miso', 'tempeh', 'tamari'],
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

// ─── Exceptions (never flagged for that allergen) ─────────────────────────────
// Ingredients containing these strings are safe for the listed allergen
// even if a keyword matches (e.g. "Reisnudeln" contains "nudeln" but is gluten-free).
// These work per-allergen: "Hafermilch" is in EXCEPTIONS['Laktose'] (no milk) but NOT
// in EXCEPTIONS['Gluten'] (oats do contain gluten unless labeled "glutenfrei").
// Cross-allergen: Mandelmilch still triggers 'Nüsse', Sojamilch still triggers 'Soja'.
const EXCEPTIONS: Record<CanonicalAllergen, string[]> = {
  'Gluten': [
    'reisnudeln', 'glasnudeln',
    'reismehl', 'maismehl', 'kichererbsenmehl',
    'buchweizenmehl', 'buchweizennudeln', 'buchweizen',
    'hirse', 'quinoa',
    // Hafer-products with explicit glutenfrei label are handled via SUBSTITUTES['Gluten']
    // ('glutenfrei' marker), not via exceptions.
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
    // Same as Laktose — these plant-based products have no milk protein either.
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
// is neutralised for THAT allergen (the ingredient IS already the allergen-safe version).
// 'laktosefrei' neutralises 'Laktose' but NOT 'Milcheiweiß' (milk-protein allergy
// requires vegan/milchfrei — laktosefrei cheese still contains milk protein).
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
// Maps known substitute product name fragments → the original ingredients they replace,
// but ONLY for the single allergen each substitution resolves.
//
// Safety rule: each entry solves exactly ONE allergen. Other allergens in the substitute
// product (e.g. Soja in Tamari, Nüsse in Mandelmilch) are caught by Fix 2 (fuer-ingredient
// self-check) and are NOT listed here — they remain warnings.
//
// 'Margarine' is intentionally absent: generic margarine may contain milk or soy
// and cannot safely stand in for butter without an explicit "vegan"/"milchfrei" label.
// 'Vegane Butter'/'Pflanzliche Butter' already carry the substitute marker 'vegan'/'pflanzlich'
// which is handled by SUBSTITUTES['Laktose/Milcheiweiß'] via Options A/B.
interface SynonymEntry {
  syn: string                     // substring to find in fuer-ingredient name (lowercase)
  targets: string[]               // base-name patterns of the ingredient being replaced
  solvesAllergen: CanonicalAllergen  // the ONLY allergen this substitution resolves
}

const SUBSTITUTE_SYNONYMS: SynonymEntry[] = [
  // ── Sojasauce → Tamari (gluten-free soy sauce, still contains soy) ────────
  // Tamari does NOT solve Soja — Tamari contains soy and Fix 2 will warn for it.
  { syn: 'tamari',                targets: ['sojasauce'],      solvesAllergen: 'Gluten' },
  { syn: 'glutenfreie sojasauce', targets: ['sojasauce'],      solvesAllergen: 'Gluten' },

  // ── Milch-Ersatz ─────────────────────────────────────────────────────────
  // Each entry solves only Laktose or Milcheiweiß. The substitute's own allergens
  // (Gluten in Hafer, Nüsse in Mandel, Soja in Soja*) → caught by fuer-self-check.
  { syn: 'pflanzendrink',  targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'pflanzendrink',  targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'haferdrink',     targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'haferdrink',     targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'mandeldrink',    targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'mandeldrink',    targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'sojadrink',      targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'sojadrink',      targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'reisdrink',      targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'reisdrink',      targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'hafermilch',     targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'hafermilch',     targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'mandelmilch',    targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'mandelmilch',    targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'sojamilch',      targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'sojamilch',      targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'reismilch',      targets: ['milch'],          solvesAllergen: 'Laktose' },
  { syn: 'reismilch',      targets: ['milch'],          solvesAllergen: 'Milcheiweiß' },
  { syn: 'kokosmilch',     targets: ['milch', 'sahne'], solvesAllergen: 'Laktose' },
  { syn: 'kokosmilch',     targets: ['milch', 'sahne'], solvesAllergen: 'Milcheiweiß' },
  { syn: 'kokossahne',     targets: ['sahne'],          solvesAllergen: 'Laktose' },
  { syn: 'kokossahne',     targets: ['sahne'],          solvesAllergen: 'Milcheiweiß' },

  // ── Joghurt-Ersatz ────────────────────────────────────────────────────────
  { syn: 'sojajoghurt',    targets: ['joghurt'],        solvesAllergen: 'Laktose' },
  { syn: 'sojajoghurt',    targets: ['joghurt'],        solvesAllergen: 'Milcheiweiß' },
  { syn: 'kokosjoghurt',   targets: ['joghurt'],        solvesAllergen: 'Laktose' },
  { syn: 'kokosjoghurt',   targets: ['joghurt'],        solvesAllergen: 'Milcheiweiß' },
  { syn: 'haferjoghurt',   targets: ['joghurt'],        solvesAllergen: 'Laktose' },
  { syn: 'haferjoghurt',   targets: ['joghurt'],        solvesAllergen: 'Milcheiweiß' },
  { syn: 'mandeljoghurt',  targets: ['joghurt'],        solvesAllergen: 'Laktose' },
  { syn: 'mandeljoghurt',  targets: ['joghurt'],        solvesAllergen: 'Milcheiweiß' },
]

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CheckMember { name: string; allergien: string[] }
export interface AllergenIssue { person: string; allergen: CanonicalAllergen; zutat: string }

type RezeptLike = { zutaten: { name: string; fuer?: string }[] }

function baseName(name: string): string {
  return name.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

// ─── Main check function ──────────────────────────────────────────────────────
// Two-pass approach:
//   Pass 1 (main loop): for each non-fuer ingredient, check if it triggers allergens
//                       for any present member and whether a fuer-ingredient solves it.
//   Pass 2 (fuer loop): check each fuer-ingredient against its own allergens — a
//                       substitute product may itself contain allergens (e.g. Hafermilch
//                       contains Gluten, Mandelmilch contains Nüsse, Tamari contains Soja).
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

  // ── Pass 1: check non-fuer ingredients ──────────────────────────────────────
  for (const zutat of rezept.zutaten) {
    if (zutat.fuer) continue  // adapted substitutes are checked in Pass 2

    const nameLower = zutat.name.toLowerCase()
    const nameBase  = baseName(zutat.name)

    for (const allergen of CANONICAL) {
      const keywords   = KEYWORDS[allergen]
      const exceptions = EXCEPTIONS[allergen]
      const substitutes = SUBSTITUTES[allergen]

      // Exception overrides keyword (e.g. "Reisnudeln" contains "nudeln" but is gluten-free)
      if (exceptions.some(ex => nameLower.includes(ex))) continue

      // Keyword match required
      if (!keywords.some(k => nameLower.includes(k))) continue

      // Ingredient already carries a substitute marker ("glutenfrei", "laktosefrei", …)
      if (substitutes.some(s => nameLower.includes(s))) continue

      // Check each affected present member
      for (const member of membersWithAllergies) {
        if (!member.allergien.includes(allergen)) continue

        // Is there a fuer=member ingredient that covers THIS SPECIFIC ingredient?
        const solved = rezept.zutaten.some(z => {
          if (z.fuer !== member.name) return false
          const fl = z.name.toLowerCase()
          const fb = baseName(z.name)

          // Pre-compute for Options A and B
          const fueIsExcept = exceptions.some(ex => fl.includes(ex))
          const fueHasSub   = substitutes.some(s  => fl.includes(s))

          // A: base names overlap AND fuer-ingredient is allergen-safe for THIS allergen.
          //    Without the sub/exception check, "Käse (laktosefrei)" would falsely solve
          //    Milcheiweiß, because laktosefrei ∉ SUBSTITUTES['Milcheiweiß'].
          if ((fb.includes(nameBase) || nameBase.includes(fb)) && (fueHasSub || fueIsExcept)) {
            return true
          }

          // B: fuer-ingredient is in the same food category AND is the allergen-safe variant
          //    (e.g. "Reisnudeln" for Gluten: triggers "nudeln" keyword, in Gluten exceptions)
          const fueTriggers = keywords.some(k => fl.includes(k))
          if (fueTriggers && (fueHasSub || fueIsExcept)) return true

          // C: substitute synonym table — only resolves the ONE allergen it was designed for.
          //    "Tamari" resolves Gluten (solvesAllergen='Gluten') but NOT Soja, because Tamari
          //    contains soy. The Soja warning is raised by Pass 2.
          return SUBSTITUTE_SYNONYMS.some(
            ({ syn, targets, solvesAllergen }) =>
              solvesAllergen === allergen &&
              fl.includes(syn) &&
              targets.some(t => nameBase.includes(t) || t.includes(nameBase)),
          )
        })

        if (!solved) issues.push({ person: member.name, allergen, zutat: zutat.name })
      }
    }
  }

  // ── Pass 2: check fuer-ingredients for their own allergens ─────────────────
  // A substitute product may itself contain allergens different from the one it solves
  // (e.g. Hafermilch solves Laktose but contains Gluten; Mandelmilch contains Nüsse).
  // No "solved" lookup here — a fuer-ingredient is already the adapted choice.
  for (const zutat of rezept.zutaten) {
    if (!zutat.fuer) continue

    const member = membersWithAllergies.find(m => m.name === zutat.fuer)
    if (!member) continue

    const fl = zutat.name.toLowerCase()

    for (const allergen of CANONICAL) {
      if (!member.allergien.includes(allergen)) continue

      const keywords    = KEYWORDS[allergen]
      const exceptions  = EXCEPTIONS[allergen]
      const substitutes = SUBSTITUTES[allergen]

      if (exceptions.some(ex => fl.includes(ex))) continue
      if (!keywords.some(k => fl.includes(k))) continue
      if (substitutes.some(s => fl.includes(s))) continue

      issues.push({ person: member.name, allergen, zutat: zutat.name })
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
