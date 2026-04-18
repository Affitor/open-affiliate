import { connection } from "next/server"
import { fetchSocialItems } from "@/lib/social"
import { SocialListen } from "@/components/social-listen"

export async function SocialListenLoader({ slug }: { slug: string }) {
  await connection()
  const items = await fetchSocialItems(slug)
  return <SocialListen items={items} />
}
