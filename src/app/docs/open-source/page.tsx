import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "What is Open Source?",
};

export default function OpenSourcePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        What is Open Source?
      </h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        A plain-language explanation for non-developers.
      </p>

      <div className="space-y-10">
        {/* Analogy */}
        <section>
          <h2 className="text-lg font-semibold mb-3">The recipe book analogy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Imagine a recipe book that anyone can read, cook from, and add their
            own recipes to. If you spot a mistake in a recipe, you can suggest a
            fix. If you have a great recipe that is not in the book, you can
            submit it for others to enjoy. The book is never locked away — it
            belongs to everyone who uses it.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Open source software works the same way. The code — the
            &ldquo;recipe&rdquo; that tells computers what to do — is published
            publicly. Anyone can read it, use it, improve it, or build
            something new on top of it.
          </p>
        </section>

        {/* What makes OpenAffiliate open source */}
        <section>
          <h2 className="text-lg font-semibold mb-3">
            What makes OpenAffiliate open source
          </h2>
          <div className="space-y-3">
            {[
              {
                title: "All program data is public YAML files on GitHub",
                desc: "Every affiliate program in the registry is stored as a small text file. You can read any of them at any time — nothing is hidden.",
              },
              {
                title: "Anyone can suggest changes or additions",
                desc: "If a commission rate is wrong or a program is missing, you can propose an update. No special access required.",
              },
              {
                title: "A community reviews and approves changes",
                desc: "Proposed changes go through a review process before they are accepted. This keeps the data accurate and trustworthy.",
              },
              {
                title: "The code that runs the website is also public",
                desc: "The Next.js app, the API, the CLI — all of it is on GitHub. Developers can audit it, fork it, or run their own instance.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border/50 bg-muted/20 p-4"
              >
                <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Why it matters */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Why it matters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                title: "Transparency",
                desc: "You can verify any program's data yourself. No black boxes, no hidden agendas.",
              },
              {
                title: "No vendor lock-in",
                desc: "The data belongs to everyone. If OpenAffiliate ever disappears, the data lives on — anyone can mirror or fork it.",
              },
              {
                title: "Community-driven",
                desc: "Hundreds of contributors keeping data accurate is more reliable than any single company trying to do it alone.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border/50 bg-muted/20 p-4"
              >
                <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* You don't need to be a developer */}
        <section className="rounded-lg border border-border/40 bg-muted/10 p-5">
          <h2 className="text-sm font-semibold mb-2">
            You do not need to be a developer
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Contributing to an open source project sounds technical, but it
            does not have to be. The easiest way to add a program to
            OpenAffiliate is through the web form — no coding, no command line,
            no GitHub account required.
          </p>
          <Link
            href="/docs/submit"
            className="inline-block mt-3 text-xs text-foreground hover:underline font-medium"
          >
            Submit a program →
          </Link>
        </section>

        {/* GitHub account */}
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Do not have a GitHub account?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            GitHub is the platform where open source projects live. It is free
            to sign up and you do not need technical knowledge to create an
            account. Visit{" "}
            <a
              href="https://github.com/signup"
              className="text-foreground hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/signup
            </a>{" "}
            to get started.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Alternatively, just use the{" "}
            <Link href="/submit" className="text-foreground hover:underline">
              web form on the submit page
            </Link>{" "}
            — it handles GitHub for you behind the scenes.
          </p>
        </section>
      </div>
    </div>
  );
}
