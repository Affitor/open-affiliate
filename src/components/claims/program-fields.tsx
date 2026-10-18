"use client";

import { Input } from "@/components/ui/input";
import { parseCommissionMode } from "@/lib/commission-mode";
import {
  APPROVALS,
  COMMISSION_TYPES,
  FREQUENCIES,
  PAYOUT_METHODS,
  STATUSES,
  type ProgramValues,
} from "@/lib/claims/form";

/**
 * The sections of the owner forms (edit a listing, add a program), grouped
 * like the program page a reader sees (claim v4 mock, design gate r3).
 */

export const fieldClass =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
export const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";
const hint = "text-xs text-muted-foreground mt-1.5";
const sectionClass = "rounded-xl border border-border/50 bg-card/30 p-5 space-y-4";

export type SetValue = <K extends keyof ProgramValues>(key: K, value: ProgramValues[K]) => void;

interface Props {
  id: string;
  values: ProgramValues;
  set: SetValue;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const textInput = (p: Props, key: keyof ProgramValues, label: string, opts: { max?: number; placeholder?: string; type?: string } = {}) => (
  <div>
    <label htmlFor={`${p.id}-${key}`} className={labelClass}>{label}</label>
    <Input
      id={`${p.id}-${key}`}
      type={opts.type ?? "text"}
      maxLength={opts.max}
      placeholder={opts.placeholder}
      value={p.values[key] as string}
      onChange={(e) => p.set(key, e.target.value as never)}
    />
  </div>
);

const textArea = (p: Props, key: keyof ProgramValues, label: string, rows: number, max?: number) => (
  <div>
    <label htmlFor={`${p.id}-${key}`} className={labelClass}>{label}</label>
    <textarea
      id={`${p.id}-${key}`}
      className={fieldClass}
      rows={rows}
      maxLength={max}
      value={p.values[key] as string}
      onChange={(e) => p.set(key, e.target.value as never)}
    />
  </div>
);

const select = (p: Props, key: keyof ProgramValues, label: string, options: [string, string][]) => (
  <div>
    <label htmlFor={`${p.id}-${key}`} className={labelClass}>{label}</label>
    <select id={`${p.id}-${key}`} className={fieldClass} value={p.values[key] as string} onChange={(e) => p.set(key, e.target.value as never)}>
      {options.map(([value, text]) => (
        <option key={value} value={value}>{text}</option>
      ))}
    </select>
  </div>
);

const checkbox = (p: Props, key: "marketingMaterials" | "dedicatedManager", label: string) => (
  <label className="inline-flex items-center gap-2 text-sm">
    <input type="checkbox" checked={p.values[key]} onChange={(e) => p.set(key, e.target.checked)} />
    {label}
  </label>
);

/** "30% recurring for 12 months · 60-day cookie · paid monthly from $50 by PayPal or Bank" */
export function termsPreview(v: ProgramValues): string {
  const parsed = parseCommissionMode(v.rate);
  const rate =
    parsed.mode === "unknown"
      ? "Not published (no number we can read)"
      : parsed.mode === "percentage"
        ? `${parsed.value}%`
        : parsed.mode === "flat"
          ? `$${parsed.value?.toLocaleString()}`
          : v.rate.trim();
  const type = COMMISSION_TYPES.find(([value]) => value === v.type)?.[1].toLowerCase() ?? v.type;
  const parts = [`${rate} ${type}${v.duration.trim() ? ` for ${v.duration.trim()}` : ""}`];
  if (v.cookieDays.trim()) parts.push(`${v.cookieDays.trim()}-day cookie`);
  const paid = [
    v.frequency ? `paid ${FREQUENCIES.find(([value]) => value === v.frequency)?.[1].toLowerCase()}` : "",
    v.payoutMinimum.trim() ? `from ${v.currency === "USD" ? "$" : `${v.currency} `}${v.payoutMinimum.trim()}` : "",
    v.methods.length
      ? `by ${v.methods.map((m) => PAYOUT_METHODS.find(([value]) => value === m)?.[1] ?? m).join(" or ")}`
      : "",
  ].filter(Boolean);
  if (paid.length) parts.push(paid.join(" "));
  return parts.join(" · ");
}

/** What you earn, plus the terms page that proves it. */
export function EarnSection(
  p: Props & { termsUrl: string; setTermsUrl: (v: string) => void; termsRequired: boolean; newProgram?: boolean },
) {
  const { values, set } = p;
  return (
    <Section title="What you earn">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {select(p, "type", "Commission type", COMMISSION_TYPES)}
        <div>
          {textInput(p, "rate", "Rate", { max: 80, placeholder: "30%" })}
          <p className={hint}>As your terms page says it, e.g. &quot;30%&quot; or &quot;$40 per paid account&quot;.</p>
        </div>
        {textInput(p, "duration", "For how long", { max: 60, placeholder: "12 months" })}
      </div>
      <div>
        {textInput(p, "conditions", "Conditions", { max: 300 })}
        <p className={hint}>Anything that changes the payout, e.g. a refund window.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {textInput(p, "cookieDays", "Cookie (days)", { type: "number" })}
        {textInput(p, "payoutMinimum", "Minimum payout", { type: "number" })}
        {select(p, "currency", "Currency", [...new Set(["USD", "EUR", "GBP", "CAD", "AUD", values.currency])].map((c) => [c, c]))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {select(p, "frequency", "Paid", FREQUENCIES)}
        <fieldset>
          <legend className={labelClass}>Payout methods</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {PAYOUT_METHODS.map(([value, text]) => (
              <label key={value} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.methods.includes(value)}
                  onChange={(e) =>
                    set("methods", e.target.checked ? [...values.methods, value] : values.methods.filter((m) => m !== value))
                  }
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {values.rate.trim() && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Reads on your page as: <span className="text-foreground font-medium">{termsPreview(values)}</span>
        </p>
      )}
      <div>
        <label htmlFor={`${p.id}-terms-url`} className={labelClass}>Your terms page</label>
        <Input
          id={`${p.id}-terms-url`}
          type="url"
          maxLength={500}
          placeholder="https://"
          required={p.termsRequired}
          value={p.termsUrl}
          onChange={(e) => p.setTermsUrl(e.target.value)}
        />
        <p className={hint}>
          {p.newProgram
            ? "Required."
            : p.termsRequired
              ? "Required: you changed what affiliates earn."
              : "Required when you change what affiliates earn."}{" "}
          We publish only what this page says.
        </p>
      </div>
    </Section>
  );
}

export function PromoteSection(p: Props) {
  return (
    <Section title="What you would promote">
      <div>
        {textInput(p, "shortDescription", "One line", { max: 100 })}
        <p className={hint}>{p.values.shortDescription.length} / 100</p>
      </div>
      {textArea(p, "description", "Description", 4, 2000)}
    </Section>
  );
}

export function FitSection(p: Props) {
  return <Section title="Good fit if your audience includes">{textArea(p, "useCases", "One per line", 4)}</Section>;
}

export function JoinSection(p: Props) {
  return (
    <Section title="How to join">
      {textInput(p, "signupUrl", "Signup link", { max: 500, type: "url", placeholder: "https://" })}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {select(p, "approval", "Approval", [["", "Not stated"], ...APPROVALS])}
        {textInput(p, "approvalTime", "How long approval takes", { max: 60 })}
      </div>
    </Section>
  );
}

export function RulesSection(p: Props) {
  return (
    <Section title="Rules before you promote">
      {textArea(p, "restrictions", "One per line", 3)}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {checkbox(p, "marketingMaterials", "We give affiliates banners and copy")}
        {checkbox(p, "dedicatedManager", "Affiliates get a dedicated manager")}
      </div>
    </Section>
  );
}

export function StatusSection(p: Props) {
  return (
    <Section title="Program status">
      <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-label="Program status">
        {STATUSES.map(([value, text]) => (
          <label key={value} className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name={`${p.id}-status`} checked={p.values.status === value} onChange={() => p.set("status", value)} />
            {text}
          </label>
        ))}
      </div>
      {textInput(p, "statusNote", "Note shown on the page (optional)", { max: 300, placeholder: "e.g. Paused while we move to a new platform" })}
    </Section>
  );
}
