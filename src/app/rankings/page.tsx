import { getCachedSiftRankings } from "@/lib/sift-rankings"
import RankingsClient from "./rankings-client"

export const revalidate = 3600

export default async function RankingsPage() {
  const initialContent = await getCachedSiftRankings()
  return <RankingsClient initialContent={initialContent} />
}
