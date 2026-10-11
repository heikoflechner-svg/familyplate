// Deterministic allergen safety check — pure logic, no AI, no I/O.

// ─── Canonical allergen names ─────────────────────────────────────────────────
// Mirrors ALLERGIE_OPTIONS in OnboardingWizard.tsx plus 'Milcheiweiß'
// as a stricter variant for full milk-protein allergy vs. lactose intolerance.
export type CanonicalAllergen =
  | 'Gluten' | 'Laktose' | 'Milcheiweiß'
  | 'Nüsse' | 'Fisch' | 'Fleisch' | 'Meeresfrüchte' | 'Eier' | 'Soja'

const CANONICAL: readonly CanonicalAllergen[] = [
  'Gluten', 'Laktose', 'Milcheiweiß',
  'Nüsse', 'Fisch', 'Fleisch', 'Meeresfrüchte', 'Eier', 'Soja',
]

// ─── Synonym normalization ────────────────────────────────────────────────────
// 'Milch' (free-text) → 'Laktose' (intolerance; laktosefrei substitute is valid).
// 'Milcheiweiß' / 'Milchallergie' → stricter; only vegan/milchfrei accepted.
const SYNONYMS: Record<string, CanonicalAllergen> = {
  'laktose': 'Laktose', 'milch': 'Laktose', 'milchzucker': 'Laktose',
  'laktoseintoleranz': 'Laktose', 'milchunverträglichkeit': 'Laktose',
  'milcheiweiß': 'Milcheiweiß', 'milchallergie': 'Milcheiweiß',
  'kuhmilchallergie': 'Milcheiweiß', 'milcheiweißallergie': 'Milcheiweiß',
  'gluten': 'Gluten', 'weizen': 'Gluten', 'weizenallergie': 'Gluten',
  'glutenunverträglichkeit': 'Gluten', 'zöliakie': 'Gluten', 'zoeliakие': 'Gluten',
  'nuss': 'Nüsse', 'nüsse': 'Nüsse', 'baumnüsse': 'Nüsse', 'schalenfrüchte': 'Nüsse',
  'eier': 'Eier', 'ei': 'Eier', 'hühnerei': 'Eier',
  'fisch': 'Fisch',
  'meeresfrüchte': 'Meeresfrüchte', 'krustentiere': 'Meeresfrüchte',
  'soja': 'Soja',
  'fleisch': 'Fleisch',
}

export function normalizeAllergen(raw: string): CanonicalAllergen | null {
  const lower = raw.toLowerCase().trim()
  if (lower in SYNONYMS) return SYNONYMS[lower]
  return (CANONICAL.find(c => c.toLowerCase() === lower) ?? null) as CanonicalAllergen | null
}

// ─── Allergen keywords ────────────────────────────────────────────────────────
// Substrings in a lowercase ingredient name that indicate the allergen.
// Exception list below overrides these for known safe items.
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
    // Same triggers as Laktose — but substitute markers are stricter (no laktosefrei).
    'butter', 'sahne', 'käse', 'mozzarella', 'parmesan', 'feta', 'joghurt', 'milch',
    'schmand', 'crème fraîche', 'creme fraiche', 'frischkäse', 'quark', 'ricotta',
    'mascarpone', 'béchamel', 'bechamel', 'gratin', 'kondensmilch',
  ],
  'Nüsse': [
    'mandel', 'haselnuss', 'haselnüsse', 'walnuss', 'walnüsse', 'cashew',
    'pistazie', 'macadamia', 'pekan', 'paranuss', 'nussmix', 'nussmus', 'pesto',
    'praline', 'marzipan',
  ],
  'Fisch': [
    'lachs', 'thunfisch', 'tuna', 'kabeljau', 'forelle', 'hering',
    'sardine', 'sardellen', 'anchovis', 'tilapia', 'dorsch', 'makrele',
    'seelachs', 'scholle', 'zander', 'barsch', 'rotbarsch',
  ],
  'Meeresfrüchte': [
    'garnele', 'shrimp', 'prawn', 'tintenfisch', 'muschel',
    'jakobsmuschel', 'hummer', 'languste', 'kaviar',
  ],
  'Eier': ['eier', 'eigelb', 'eiweiß', 'mayonnaise', 'mayo'],
  'Soja': ['soja', 'tofu', 'edamame', 'miso', 'tempeh'],
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
// Cross-allergen rules: Mandelmilch still triggers 'Nüsse',
// Hafermilch still triggers 'Gluten', Sojamilch still triggers 'Soja'.
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
  'Nüsse':        [],
  'Fisch':        [],
  'Meeresfrüchte': [],
  'Soja':         [],
  'Fleisch':      [],
}

// ─── Substitute markers ───────────────────────────────────────────────────────
// If ANY of these substrings appears in an ingredient name, the allergen trigger
// is neutralised (this ingredient is already the allergen-safe version).
// Key distinction: 'laktosefrei' neutralises 'Laktose' but NOT 'Milcheiweiß'.
const SUBSTITUTES: Record<CanonicalAllergen, string[]> = {
  'Gluten':       ['glutenfrei', 'gluten-frei'],
  'Laktose':      ['laktosefrei', 'laktose-frei', 'ohne laktose', 'pflanzlich', 'vegan', 'milchfrei'],
  'Milcheiweiß':  ['pflanzlich', 'vegan', 'milchfrei'],
  'Nüsse':        [],
  'Fisch':        [],
  'Meeresfrüchte': ['vegan', 'pflanzlich'],
  'Eier':         ['vegan', 'ei-ersatz'],
  'Soja':         [],
  'Fleisch':      ['vegan', 'pflanzlich', 'vegetarisch'],
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CheckMember { name: string; allergien: string[] }
export interface AllergenIssue { person: string; allergen: CanonicalAllergen; zutat: string }

// Minimal recipe shape — avoids importing from state.ts (prevents circular deps).
type RezeptLike = { zutaten: { name: string; fuer?: string }[] }

function baseName(name: string): string {
  return name.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

// ─── Main check function ──────────────────────────────────────────────────────
// Per-ingredient rule: an ingredient is only "solved" for person P when there is
// a fuer=P ingredient that specifically substitutes THAT ingredient, not just
// any ingredient of the same allergen category.
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

      // 1. Exception check (e.g. "Reisnudeln" is gluten-free despite "nudeln")
      if (exceptions.some(ex => nameLower.includes(ex))) continue

      // 2. Keyword match
      if (!keywords.some(k => nameLower.includes(k))) continue

      // 3. Ingredient already carries substitute markers
      if (substitutes.some(s => nameLower.includes(s))) continue

      // 4. Check each affected present member
      for (const member of membersWithAllergies) {
        if (!member.allergien.includes(allergen)) continue

        // 5. Is there a fuer=member.name ingredient that covers THIS SPECIFIC ingredient?
        const solved = rezept.zutaten.some(z => {
          if (z.fuer !== member.name) return false
          const fl = z.name.toLowerCase()
          const fb = baseName(z.name)

          // A: base names overlap (e.g. "Mozzarella" ↔ "Mozzarella (laktosefrei)")
          if (fb.includes(nameBase) || nameBase.includes(fb)) return true

          // B: the fuer-ingredient also triggers the same allergen keyword AND carries
          //    substitute markers (e.g. "Sojasauce (glutenfrei)" covers "Sojasauce")
          const fueTriggers = keywords.some(k => fl.includes(k))
          const fueHasSub = substitutes.some(s => fl.includes(s))
          const fueIsExcept = exceptions.some(ex => fl.includes(ex))
          return fueTriggers && (fueHasSub || fueIsExcept)
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
