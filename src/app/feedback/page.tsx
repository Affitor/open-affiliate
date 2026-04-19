"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { MessageSquare } from "lucide-react";

const FORM_EN = "EkbvLo";
const FORM_VI = "2EAzEp";

function detectVietnamese(): boolean {
  if (typeof navigator === "undefined") return false;
  const lang = navigator.language || "";
  return lang.startsWith("vi");
}

export default function FeedbackPage() {
  const [formId, setFormId] = useState(FORM_EN);
  const [lang, setLang] = useState<"en" | "vi">("en");

  useEffect(() => {
    if (detectVietnamese()) {
      requestAnimationFrame(() => {
        setFormId(FORM_VI);
        setLang("vi");
      });
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-tight">
            {lang === "vi" ? "Gop y & De xuat" : "Feedback & Feature Requests"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === "vi"
            ? "Giup chung toi cai thien OpenAffiliate. Moi y kien deu duoc doc."
            : "Help us improve OpenAffiliate. Every submission is read."}
        </p>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => { setFormId(FORM_EN); setLang("en"); }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              lang === "en"
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            English
          </button>
          <button
            onClick={() => { setFormId(FORM_VI); setLang("vi"); }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              lang === "vi"
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tieng Viet
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card/50 p-1 min-h-[500px]">
        <iframe
          key={formId}
          data-tally-src={`https://tally.so/embed/${formId}?alignLeft=1&hideTitle=0&transparentBackground=1&dynamicHeight=1`}
          loading="lazy"
          width="100%"
          height="500"
          frameBorder="0"
          title="Feedback form"
        />
      </div>

      <Script
        src="https://tally.so/widgets/embed.js"
        strategy="lazyOnload"
      />
    </div>
  );
}
