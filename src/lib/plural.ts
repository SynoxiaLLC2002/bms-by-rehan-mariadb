// Counting things, in whatever language the site is in.
//
// "n === 1 ? one : many" is English's rule (and Dutch's, and German's). It is
// wrong for most of the languages this CMS offers:
//
//   Polish    1 artykuł · 2 artykuły · 5 artykułów      (one / few / many)
//   Russian   1 запись  · 2 записи   · 5 записей        (one / few / many)
//   Arabic    0 مقالات · 1 مقال · 2 مقالان · 3 مقالات · 11 مقالاً  (six forms)
//   Japanese  1 件 · 2 件                                (one form, always)
//
// Rather than hand-code any of that, ask the platform: `Intl.PluralRules` ships
// with the CLDR rules for every language, in Node and in every browser this
// site targets. A table supplies the forms it has and the right one is picked.
//
// A language that only ever needs one form supplies `other` alone. English-like
// languages supply `one` and `other`. Nothing else has to be understood by the
// person adding a language — which is the point, because the person adding the
// next one will not be a speaker of all 47.

/**
 * The word forms for a count, by CLDR plural category.
 *
 * `other` is required because every language has it; the rest are filled in
 * only where that language uses them.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/**
 * The form `n` takes in `language`, falling back through the categories that
 * language actually has to `other`.
 *
 * Never throws: an unknown or malformed language tag falls back to English
 * rules, which is what the surrounding tables do with an unknown language too.
 */
export function pluralForm(language: string, n: number, forms: PluralForms): string {
  let category: Intl.LDMLPluralRule = "other";
  try {
    category = new Intl.PluralRules(language || "en").select(n);
  } catch {
    category = n === 1 ? "one" : "other";
  }
  return forms[category] ?? forms.other;
}

/** "5 posts" — the count and its word, in the language's own plural form. */
export function counted(language: string, n: number, forms: PluralForms): string {
  return `${n} ${pluralForm(language, n, forms)}`;
}
