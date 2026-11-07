// The contact form's shape and its validation rules.
//
// Pure — no database imports — because the block editor, the rendered form and
// the submit endpoint all need to agree on what a field is, and only the last
// of those runs on the server. Validating in one place means the client can
// show friendly errors while the server still refuses anything invalid.

export const FIELD_TYPES = [
  { id: "text",     label: "Text" },
  { id: "email",    label: "Email" },
  { id: "tel",      label: "Phone" },
  { id: "url",      label: "URL" },
  { id: "number",   label: "Number" },
  { id: "textarea", label: "Long text" },
  { id: "select",   label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
] as const;

export interface FormField {
  /** Stable key used as the payload key and the input name. */
  name: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  /** Newline-separated choices, for `select`. */
  options?: string;
  /** Half-width on wide screens, so two fields can share a row. */
  half?: boolean;
}

export const DEFAULT_FIELDS: FormField[] = [
  { name: "name",    label: "Name",    type: "text",     required: true, half: true },
  { name: "email",   label: "Email",   type: "email",    required: true, half: true },
  { name: "message", label: "Message", type: "textarea", required: true },
];

/** Field names must survive a round trip through form data and JSON keys. */
export function fieldKey(name: string, index: number): string {
  const k = (name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return k || `field_${index + 1}`;
}

export function parseFields(raw: unknown): FormField[] {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_FIELDS;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length === 0) return DEFAULT_FIELDS;
    return v.map((f, i) => ({
      name: fieldKey(String(f?.name ?? ""), i),
      label: String(f?.label ?? "Field"),
      type: FIELD_TYPES.some((t) => t.id === f?.type) ? String(f.type) : "text",
      required: !!f?.required,
      placeholder: f?.placeholder ? String(f.placeholder) : undefined,
      options: f?.options ? String(f.options) : undefined,
      half: !!f?.half,
    }));
  } catch {
    return DEFAULT_FIELDS;
  }
}

export const selectOptions = (f: FormField) =>
  (f.options ?? "").split("\n").map((o) => o.trim()).filter(Boolean);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The longest a single answer may be, so one submission can't fill the table. */
export const MAX_FIELD_LENGTH = 5000;

/**
 * How many fields one submission may carry.
 *
 * The submit endpoint reads the form's field list out of the *request body* —
 * the browser sends the block's own definition along with the answers — so the
 * allowlist it filters against is supplied by whoever is posting. A crafted
 * request can therefore declare its own fields and have them stored. Until the
 * definition is resolved server-side (see AUDIT.md), this caps the blast radius
 * to something a rate-limited attacker cannot turn into bulk storage.
 *
 * Comfortably above any real form: the built-in one has four fields.
 */
export const MAX_FIELDS = 40;

/**
 * Checks one submission against its own field list.
 *
 * Returns a map of field name to message; empty means valid. The same function
 * runs in the browser for instant feedback and on the server as the real gate,
 * so a hand-crafted POST is held to exactly the same rules.
 */
/**
 * Localised wording for the two validation messages.
 *
 * Plain strings with a `{field}` placeholder, deliberately not functions: the
 * form renders in a client component, and uiText's function-valued keys are
 * what caused the "functions cannot be passed to a Client Component" crashes
 * (reasons.txt 6A). Omitted, the English defaults apply — which is what the
 * server-side gate uses, since a hand-crafted POST has no page language.
 */
export interface ValidationMessages {
  /** `{field}` is replaced with the field's label. */
  required?: string;
  invalidEmail?: string;
}

export function validateSubmission(
  fields: FormField[],
  values: Record<string, unknown>,
  messages: ValidationMessages = {}
): Record<string, string> {
  const errors: Record<string, string> = {};
  const requiredMsg = (label: string) =>
    (messages.required || "{field} is required").replace("{field}", label);
  const emailMsg = messages.invalidEmail || "Enter a valid email address";

  for (const f of fields) {
    const raw = values[f.name];
    const value = typeof raw === "string" ? raw.trim() : raw;

    if (f.type === "checkbox") {
      if (f.required && !value) errors[f.name] = requiredMsg(f.label);
      continue;
    }

    const str = typeof value === "string" ? value : value == null ? "" : String(value);

    if (!str) {
      if (f.required) errors[f.name] = requiredMsg(f.label);
      continue;
    }
    if (str.length > MAX_FIELD_LENGTH) {
      errors[f.name] = `${f.label} is too long`;
      continue;
    }
    if (f.type === "email" && !EMAIL.test(str)) errors[f.name] = emailMsg;
    if (f.type === "url" && !/^https?:\/\/\S+$/i.test(str)) errors[f.name] = "Enter a full URL starting with http";
    if (f.type === "number" && Number.isNaN(Number(str))) errors[f.name] = "Enter a number";
    if (f.type === "select" && selectOptions(f).length > 0 && !selectOptions(f).includes(str)) {
      errors[f.name] = "Choose one of the listed options";
    }
  }

  return errors;
}

/** The hidden field bots fill in and people never see. */
export const HONEYPOT_FIELD = "bms_website";

/**
 * A form completed faster than this was almost certainly not typed by hand.
 * Deliberately short — a fast typist on a two-field form is not spam.
 */
export const MIN_FILL_MS = 2500;

