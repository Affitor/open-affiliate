"use client";

import { useState } from "react";
import type { EstimateInput } from "@/lib/program-page";

const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

/**
 * What a reader could earn with their own numbers. Only the commission itself
 * reaches the browser (estimateInput), never a cookie, payout or approval term.
 * Empty until the reader moves the slider or enters a price, so no figure reads as a promise.
 */
export function EarningsCalculator({ input }: { input: EstimateInput }) {
  const [customers, setCustomers] = useState(5);
  const [price, setPrice] = useState("");
  const [touched, setTouched] = useState(false);
  const flat = input.mode === "flat";
  const amount = Number(price);
  const per = flat ? (touched ? input.value : null) : amount > 0 ? (amount * input.value) / 100 : null;
  const at = Math.min(12, input.months);
  let monthly: number | null = null;
  let yearOne: number | null = null;
  if (per != null) {
    if (input.recurring) {
      monthly = customers * at * per;
      yearOne = 0;
      for (let m = 1; m <= 12; m++) yearOne += customers * Math.min(m, input.months) * per;
    } else {
      monthly = customers * per;
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span>
          Customers you refer each month: <b className="tabular-nums">{customers}</b>
        </span>
        <input
          type="range"
          min={1}
          max={50}
          value={customers}
          onChange={(e) => {
            setCustomers(Number(e.target.value));
            setTouched(true);
          }}
          // Pressing the slider at its current value also counts as entering it.
          onPointerDown={() => setTouched(true)}
          onKeyDown={() => setTouched(true)}
          className="w-full accent-foreground"
        />
      </label>
      {!flat && (
        <label className="grid gap-1.5 text-sm">
          {input.recurring ? "Plan price they pay ($ per month)" : "Average order value ($)"}
          <input
            type="number"
            min={1}
            inputMode="decimal"
            placeholder="Enter a price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-8" aria-live="polite">
        <div>
          <p className="text-xs text-muted-foreground">{input.recurring ? `Per month, at month ${at}` : "Per month"}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{monthly == null ? "—" : money(monthly)}</p>
        </div>
        {input.recurring && (
          <div>
            <p className="text-xs text-muted-foreground">Earned in year one, before payout holds</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{yearOne == null ? "—" : money(yearOne)}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Your numbers, not a promise. Uses the published {input.label}; the program&apos;s own terms decide what is paid and when.
      </p>
    </div>
  );
}
