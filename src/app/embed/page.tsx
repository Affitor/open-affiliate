import Script from "next/script"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Embed — OpenAffiliate",
  description:
    "Embed live OpenAffiliate data on your site. SVG badges for READMEs, interactive web components for partner pages. Free for public use, premium tiers unlock advanced features.",
}

export default function EmbedPage(): JSX.Element {
  return (
    <>
      <Script
        src="/embed.js"
        type="module"
        strategy="afterInteractive"
      />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">Embed</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Show your Affiliate Score anywhere.
          </h1>
          <p className="mt-3 text-lg text-neutral-600">
            SVG badges, interactive widgets, and direct API reads. Free for public use.
          </p>
        </header>

        <Section title="SVG badge" hint="Zero JavaScript. Works in GitHub READMEs, Notion, docs, anywhere Markdown goes.">
          <Live>
            <img
              src="/api/badge/stripe"
              alt="Stripe affiliate score"
              style={{ height: 22, imageRendering: "pixelated" }}
            />
            <img
              src="/api/badge/stripe?theme=dark"
              alt="Stripe affiliate score (dark)"
              style={{ height: 22 }}
            />
            <img src="/api/badge/stripe?style=card" alt="Stripe card" style={{ height: 88 }} />
          </Live>
          <Snippet lang="md">
            {`![Affiliate Score](https://openaffiliate.dev/api/badge/stripe)
![Affiliate Score](https://openaffiliate.dev/api/badge/stripe?theme=dark)
![Affiliate Score](https://openaffiliate.dev/api/badge/stripe?style=card)`}
          </Snippet>
          <Snippet lang="html">
            {`<img src="https://openaffiliate.dev/api/badge/stripe" alt="Affiliate Score" />`}
          </Snippet>
          <Note>
            Query params: <code>variant</code> (score | commission | cookie) ·{" "}
            <code>theme</code> (light | dark | flat) · <code>style</code> (pill | card).
          </Note>
        </Section>

        <Section
          title="Interactive badge"
          hint="Web component with Shadow DOM — no CSS conflicts, no framework lock-in. ~3kb gzipped."
        >
          <Live>
            {/* @ts-expect-error — custom element */}
            <openaffiliate-badge program="stripe"></openaffiliate-badge>
            {/* @ts-expect-error */}
            <openaffiliate-badge program="stripe" variant="card"></openaffiliate-badge>
            {/* @ts-expect-error */}
            <openaffiliate-badge program="stripe" variant="card" theme="dark"></openaffiliate-badge>
          </Live>
          <Snippet lang="html">
            {`<script type="module" src="https://openaffiliate.dev/embed.js"></script>

<openaffiliate-badge program="stripe"></openaffiliate-badge>
<openaffiliate-badge program="stripe" variant="card" theme="dark"></openaffiliate-badge>`}
          </Snippet>
        </Section>

        <Section
          title="Programs list"
          hint="Drop-in list for partners pages, comparison sites, newsletters. Filter by category, type, or verified status."
        >
          <Live>
            {/* @ts-expect-error */}
            <openaffiliate-list category="Developer Tools" limit={6} columns={3}></openaffiliate-list>
          </Live>
          <Snippet lang="html">
            {`<openaffiliate-list category="Developer Tools" limit="6" columns="3"></openaffiliate-list>
<openaffiliate-list verified="true" limit="12"></openaffiliate-list>
<openaffiliate-list query="email marketing" limit="6"></openaffiliate-list>`}
          </Snippet>
          <Note>
            Attributes: <code>category</code>, <code>type</code>, <code>verified</code>,{" "}
            <code>query</code>, <code>limit</code>, <code>columns</code>, <code>theme</code>.
          </Note>
        </Section>

        <Section title="Theming" hint="Override CSS custom properties on the host to match your brand.">
          <Snippet lang="css">
            {`openaffiliate-list {
  --oa-accent-override: #ff6363;    /* brand color */
  --oa-radius-override: 12px;
  --oa-bg-override: #0a0a0a;        /* dark bg */
  --oa-fg-override: #fafafa;
  --oa-border-override: #27272a;
}`}
          </Snippet>
        </Section>

        <Section
          title="Direct API"
          hint="If you want full control over rendering, hit the REST API directly. CORS-enabled, no auth for public reads."
        >
          <Snippet lang="bash">
            {`curl https://openaffiliate.dev/api/programs/stripe
curl "https://openaffiliate.dev/api/programs?category=SaaS&limit=10"`}
          </Snippet>
          <Note>
            See <a href="/docs/api" className="text-blue-600 underline">the API reference</a> for
            filters, sort options, and response schema.
          </Note>
        </Section>

        <footer className="mt-16 rounded border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
          <strong>Need more?</strong> OpenAffiliate Pro unlocks per-domain license keys, usage
          analytics, realtime program change webhooks, and custom enrichment. Contact{" "}
          <a href="mailto:hello@affitor.com" className="text-blue-600 underline">
            hello@affitor.com
          </a>
          .
        </footer>
      </main>
    </>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="mb-16 border-t border-neutral-200 pt-10">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-2 text-sm text-neutral-600">{hint}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  )
}

function Live({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6">
      <div className="mb-3 text-xs uppercase tracking-wide text-neutral-400">Live preview</div>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  )
}

function Snippet({ lang, children }: { lang: string; children: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-neutral-950 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{lang}</span>
      </div>
      <pre className="overflow-x-auto text-xs leading-5 text-neutral-200">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs text-neutral-500">{children}</p>
}
