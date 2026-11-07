"use client";

import Turnstile, { resetTurnstile } from "@/components/frontend/Turnstile";

import { useRef, useState } from "react";
import {
  HONEYPOT_FIELD,
  selectOptions,
  validateSubmission,
  type FormField,
} from "@/lib/forms";

/** The HTML autocomplete token for a field, from its type or its name; undefined = none. */
function autoCompleteOf(f: { name: string; type: string }): string | undefined {
  if (f.type === "email") return "email";
  if (f.type === "tel") return "tel";
  if (/^(full_?)?name$/i.test(f.name)) return "name";
  if (/phone|tel/i.test(f.name)) return "tel";
  return undefined;
}

/**
 * The rendered contact form.
 *
 * Validates with the same function the endpoint uses, so what the visitor sees
 * and what the server enforces can't drift. The two spam traps — a hidden field
 * and a minimum fill time — cost the visitor nothing and stop the bulk of
 * drive-by bots without a captcha.
 */

export default function ContactFormFE({
  formId,
  formName,
  fields,
  submitLabel,
  successMessage,
  redirectUrl,
  align,
  messages,
}: {
  /** The block's id — the server loads the form's definition by it. */
  formId: string;
  formName: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
  redirectUrl: string;
  /** Localised validation wording — plain strings, see lib/forms.ts. */
  messages?: { required?: string; invalidEmail?: string };
  align: string;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const startedAt = useRef(Date.now());

  const set = (name: string, v: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    // Clear a field's error as soon as it's touched, rather than making the
    // visitor resubmit to find out they fixed it.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    const form = e.currentTarget;

    const found = validateSubmission(fields, values as Record<string, unknown>, messages);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setState("error");
      setMessage("");
      return;
    }

    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          values,
          elapsed: Date.now() - startedAt.current,
          pagePath: window.location.pathname,
          turnstileToken: (form.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors ?? {});
        setState("error");
        setMessage(data.error || "Could not send your message.");
        resetTurnstile(form);
        return;
      }
      if (redirectUrl) { window.location.href = redirectUrl; return; }
      setState("sent");
    } catch {
      setState("error");
      setMessage("Could not reach the server. Please try again.");
      resetTurnstile(form);
    }
  }

  if (state === "sent") {
    return (
      <div className="cform cform-done my-6" role="status">
        <p>{successMessage || "Thanks — your message has been sent."}</p>
      </div>
    );
  }

  const alignCls = align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : "";

  return (
    <form onSubmit={submit} className={`cform my-6 ${alignCls}`} noValidate>
      <div className="cform-grid">
        {fields.map((f) => {
          const id = `cf-${formName.replace(/\W+/g, "-")}-${f.name}`;
          const err = errors[f.name];
          const common = {
            id,
            name: f.name,
            required: f.required,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-err` : undefined,
            placeholder: f.placeholder || undefined,
            className: `cform-input${err ? " has-error" : ""}`,
            // WCAG 1.3.5: browsers and assistive tech fill these in (name, email, phone).
            autoComplete: autoCompleteOf(f),
          };
          return (
            <div key={f.name} className={`cform-field${f.half ? " is-half" : ""}`}>
              {f.type === "checkbox" ? (
                <label className="cform-check" htmlFor={id}>
                  <input
                    id={id}
                    name={f.name}
                    type="checkbox"
                    checked={!!values[f.name]}
                    onChange={(e) => set(f.name, e.target.checked)}
                    aria-invalid={err ? true : undefined}
                  />
                  <span>
                    {f.label}
                    {f.required && <span aria-hidden="true"> *</span>}
                  </span>
                </label>
              ) : (
                <>
                  <label className="cform-label" htmlFor={id}>
                    {f.label}
                    {f.required && <span aria-hidden="true"> *</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      {...common}
                      rows={5}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  ) : f.type === "select" ? (
                    <select
                      {...common}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    >
                      <option value="">{f.placeholder || "Choose…"}</option>
                      {selectOptions(f).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...common}
                      type={f.type}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                </>
              )}
              {err && <p id={`${id}-err`} className="cform-error">{err}</p>}
            </div>
          );
        })}
      </div>

      {/* Hidden from people and from screen readers; only bots fill it in. */}
      <div className="cform-hp" aria-hidden="true">
        <label htmlFor={`${formName}-hp`}>Leave this field empty</label>
        <input
          id={`${formName}-hp`}
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={(values[HONEYPOT_FIELD] as string) ?? ""}
          onChange={(e) => set(HONEYPOT_FIELD, e.target.value)}
        />
      </div>

      <Turnstile className="cform-turnstile" />
      <div className="cform-actions">
        <button type="submit" className="btn" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : submitLabel || "Send"}
        </button>
        {message && <p className="cform-error" role="alert">{message}</p>}
      </div>
    </form>
  );
}
