import { useState } from "react"
import { Disc3, Music2 } from "lucide-react"
import { coverUrl } from "@/library"

// Embedded album art, falling back to the placeholder when absent or broken.
export function Cover({ cover, size = "regular", album = false }: { cover?: string; size?: "small" | "regular" | "large"; album?: boolean }) {
  const [failed, setFailed] = useState("")
  const url = coverUrl({ cover })
  const iconSize = size === "large" ? 44 : size === "small" ? 18 : 23
  if (url && failed !== url) return <img className={`cover-image ${size}`} src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(url)} />
  return <div className={`cover-placeholder ${size}`}>{album ? <Disc3 size={iconSize} /> : <Music2 size={iconSize} />}</div>
}
