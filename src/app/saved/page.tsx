import type { Metadata } from "next"
import { SavedPrograms } from "./saved-programs"

export const metadata: Metadata = {
  title: "Saved programs",
  description: "Your saved affiliate programs, stored only in this browser.",
  robots: { index: false, follow: true },
}

export default function SavedPage() {
  return (
    <div className="oa-frame px-4 sm:px-12 py-10 sm:py-14">
      <p className="oa-label">Your shortlist</p>
      <h1 className="mt-2 text-title sm:text-display font-semibold tracking-tight">Saved programs</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">Keep programs to come back to. Saved in this browser only, without an account. Clearing browser data clears this list.</p>
      <SavedPrograms />
    </div>
  )
}
