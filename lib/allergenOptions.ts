// Shared allergen options — single source of truth for OnboardingWizard and ProfilScreen.
// Value = stored in DB, label = display text.
// ⚠️ WICHTIG: Liste muss vor dem Launch fachlich geprüft werden (DAAB, DZG).
export const ALLERGIE_OPTIONS: { value: string; label: string }[] = [
  // EU-14-Hauptallergene (VO (EU) Nr. 1169/2011)
  { value: 'Gluten',        label: 'Gluten (Weizen, Dinkel, …)' },
  { value: 'Laktose',       label: 'Laktose (Unverträglichkeit)' },
  { value: 'Milcheiweiß',   label: 'Milch (Allergie, Milcheiweiß)' },
  { value: 'Eier',          label: 'Eier' },
  { value: 'Erdnüsse',      label: 'Erdnüsse' },
  { value: 'Nüsse',         label: 'Schalenfrüchte (Nüsse)' },
  { value: 'Soja',          label: 'Soja' },
  { value: 'Fisch',         label: 'Fisch' },
  { value: 'Krebstiere',    label: 'Krebstiere' },
  { value: 'Weichtiere',    label: 'Weichtiere' },
  { value: 'Sellerie',      label: 'Sellerie' },
  { value: 'Senf',          label: 'Senf' },
  { value: 'Sesam',         label: 'Sesam' },
  { value: 'Lupinen',       label: 'Lupinen' },
  { value: 'Sulfite',       label: 'Sulfite / SO₂' },
  // Rückwärtskompatibel (vor EU-14-Split)
  { value: 'Meeresfrüchte', label: 'Meeresfrüchte (allg.)' },
  // Ernährungsweise, kein Allergen
  { value: 'Fleisch',       label: 'Fleisch (Ernährungsweise)' },
]

export function getAllergenLabel(value: string): string {
  return ALLERGIE_OPTIONS.find(o => o.value === value)?.label ?? value
}

// Values that are free-text synonyms for "Laktose" and should prompt the user
// to switch to the more precise 'Laktose' or 'Milcheiweiß' option.
export const MILCH_FREITEXT_HINT_VALUES = ['milch', 'Milch', 'milcheiweiß', 'Milcheiweiß']
