import type { Metadata } from "next"
import RankingsClient from "../rankings-client"
import { commissionProps } from "../commission-props"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Affiliate Programs by Commission: Highest Paying",
  description: "Verified affiliate programs sorted by what they pay: commission, how long it recurs, cookie length and payout minimum.",
  alternates: { canonical: "/rankings/commission" },
  openGraph: {
    title: "Affiliate Programs by Commission: OpenAffiliate",
    description: "Verified affiliate programs sorted by commission, cookie and payout minimum.",
    url: "https://openaffiliate.dev/rankings/commission",
    siteName: "OpenAffiliate",
  },
}

/** The commission table that used to close /rankings (Sơn 19/10: its own page). */
export default function CommissionPage() {
  return <RankingsClient title="Programs by commission" oas={null} {...commissionProps()} />
}
