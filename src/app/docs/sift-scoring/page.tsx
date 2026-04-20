import type { Metadata } from "next";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "Content Scoring (SIFT)",
  description:
    "How AI classifies social content relevance for affiliate programs, scored from 0 to 10.",
};

export default function SiftScoringPage() {
  return (
    <div>
      <DocsHeader
        group="Guides"
        title="Content Scoring (SIFT)"
        description="How AI classifies social content relevance for affiliate programs, scored from 0 to 10."
      />

      <div className="space-y-10">
        {/* Overview */}
        <section>
          <h2 id="overview" className="text-lg font-semibold mb-3">
            Overview
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            SIFT (Sifting Intelligence for Trust) is the AI-powered scoring
            system that classifies social content by how relevant it is to a
            specific affiliate program. It scans YouTube videos, TikToks,
            Reddit threads, and blog posts, then assigns a relevance score
            from 0 to 10.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            The goal is to surface real reviews and affiliate-driven content
            while filtering out name collisions, spam, and unrelated posts.
            Instead of manually sifting through hundreds of results, affiliates
            can immediately focus on content that actually matters.
          </p>
        </section>

        {/* How It Works */}
        <section>
          <h2 id="how-it-works" className="text-lg font-semibold mb-3">
            How It Works
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            SIFT runs a two-stage pipeline for each piece of social content:
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 p-4">
              <p className="text-sm font-semibold mb-1">Stage 1 — Rule-based pre-filter</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A fast rule engine catches obvious spam, music and movie
                content, and posts that have high view counts but never mention
                the product name. Items flagged here are marked as junk without
                spending any AI tokens, keeping scoring costs low.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 p-4">
              <p className="text-sm font-semibold mb-1">Stage 2 — LLM relevance scoring</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Content that passes the pre-filter is scored by a language
                model on a 0 to 10 scale. The model evaluates whether the
                content mentions the product, how prominently, and whether it
                appears to be a genuine review, tutorial, or affiliate
                promotion.
              </p>
            </div>
          </div>
        </section>

        {/* Score Guide */}
        <section>
          <h2 id="score-guide" className="text-lg font-semibold mb-3">
            Score Guide
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-center px-4 py-2.5 font-semibold w-16">Score</th>
                  <th className="text-left px-4 py-2.5 font-semibold">What it means</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">0</td>
                  <td className="px-4 py-2.5">Completely unrelated — wrong topic, wrong product, wrong context</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">1</td>
                  <td className="px-4 py-2.5">Name collision — shares the product name but is a different entity (e.g., a YouTube channel called &quot;Jubilee&quot; vs Jubilee software)</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">2</td>
                  <td className="px-4 py-2.5">Spam hashtags or filler posts — &quot;new on TikTok&quot; style content with no substance</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">3</td>
                  <td className="px-4 py-2.5">Same industry or category, but does not mention this specific product</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">4–5</td>
                  <td className="px-4 py-2.5">Mentions the product briefly or in passing — tangential reference</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">6–7</td>
                  <td className="px-4 py-2.5">Dedicated review or tutorial covering this product in meaningful depth</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">8–9</td>
                  <td className="px-4 py-2.5">Clear affiliate content — review with affiliate links, comparison, or walkthrough</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-center font-mono font-semibold text-foreground">10</td>
                  <td className="px-4 py-2.5">Perfect affiliate review — full demo, pros and cons, affiliate link in description</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Quality Filters */}
        <section>
          <h2 id="quality-filters" className="text-lg font-semibold mb-3">
            Quality Filters
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            The Explore page lets you filter content by SIFT score threshold.
            Each tier is designed for a different use case:
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold">Filter</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Threshold</th>
                  <th className="text-left px-4 py-2.5 font-semibold">What it shows</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">All Content</td>
                  <td className="px-4 py-2.5 text-center">none</td>
                  <td className="px-4 py-2.5">Everything, including unscored and low-quality items</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Possible</td>
                  <td className="px-4 py-2.5 text-center">3+</td>
                  <td className="px-4 py-2.5">Filters out obvious junk and name collisions, keeps tangential mentions</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Related</td>
                  <td className="px-4 py-2.5 text-center">5+</td>
                  <td className="px-4 py-2.5">Content that meaningfully mentions the product — a good starting point</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-foreground">Verified</td>
                  <td className="px-4 py-2.5 text-center">7+</td>
                  <td className="px-4 py-2.5">Confirmed reviews, tutorials, and affiliate content — highest signal</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Tags */}
        <section>
          <h2 id="tags" className="text-lg font-semibold mb-3">
            Tags
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Each scored item may carry one or more tags that describe its
            content type. Tags are assigned by the LLM alongside the numeric
            score.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold">Tag</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">junk</td>
                  <td className="px-4 py-2.5">Caught by pre-filter — spam, unrelated, or noise content</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">name_collision</td>
                  <td className="px-4 py-2.5">Shares the product name but refers to a different brand or entity</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">spam</td>
                  <td className="px-4 py-2.5">Hashtag stuffing, repost chains, or engagement bait with no real content</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">tangential</td>
                  <td className="px-4 py-2.5">Related industry or topic but does not focus on this product</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">related</td>
                  <td className="px-4 py-2.5">Mentions the product in a relevant context</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">review</td>
                  <td className="px-4 py-2.5">Opinion or evaluation of the product, positive or negative</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">tutorial</td>
                  <td className="px-4 py-2.5">How-to or walkthrough showing how to use the product</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">comparison</td>
                  <td className="px-4 py-2.5">Side-by-side comparison with one or more competing products</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">affiliate_content</td>
                  <td className="px-4 py-2.5">Dedicated affiliate promotion — contains links, discount codes, or CTA</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* How to Use */}
        <section>
          <h2 id="how-to-use" className="text-lg font-semibold mb-3">
            How to Use
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            SIFT scores are most useful when you treat them as a research tool
            rather than a ranking. Here are a few practical patterns:
          </p>
          <ul className="space-y-3 text-sm text-muted-foreground list-disc list-inside">
            <li>
              <span className="font-medium text-foreground">Start at Verified (7+)</span> to find proven content patterns — what formats, angles, and platforms are already working for this program.
            </li>
            <li>
              <span className="font-medium text-foreground">Filter by category</span> to see what content styles perform in your niche. Tutorial-heavy niches behave differently from comparison-driven ones.
            </li>
            <li>
              <span className="font-medium text-foreground">Sort by SIFT Score</span> to surface the highest-quality items first when browsing a large result set.
            </li>
            <li>
              <span className="font-medium text-foreground">Read the tags</span> to understand what types of content are driving results. A program with many <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">comparison</code> tags suggests affiliates win by positioning against competitors.
            </li>
            <li>
              <span className="font-medium text-foreground">Use Possible (3+)</span> when you want a broad signal — useful for programs with low existing coverage to spot any mention at all.
            </li>
          </ul>
        </section>

        {/* Methodology */}
        <section>
          <h2 id="methodology" className="text-lg font-semibold mb-3">
            Methodology
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            SIFT is designed to be transparent. A few key rules that govern
            how scores are assigned:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>
              If the content does not mention the product name at all, the maximum score is 3 — no matter how high-quality the content otherwise appears.
            </li>
            <li>
              Pre-filter rules catch spam patterns, music and movie content, and high-view posts with no product mention before any AI is involved.
            </li>
            <li>
              Scoring runs daily via an automated pipeline. New content collected overnight is scored the following morning.
            </li>
            <li>
              The scoring logic is open — the rule definitions and LLM prompt structure are available in the repository for review and contribution.
            </li>
          </ul>
        </section>
      </div>

      <DocsPagination currentPath="/docs/sift-scoring" />
    </div>
  );
}
