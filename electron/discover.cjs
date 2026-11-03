const { XMLParser } = require("fast-xml-parser")

// Music search through the user's own indexer manager. Two providers:
// - "prowlarr": Prowlarr's native API (/api/v1/search), which searches every
//   enabled indexer at once — its Torznab endpoints only cover one indexer.
// - "torznab": any Torznab endpoint, e.g. Jackett's "all" aggregate.
// The endpoint and API key are user-supplied; the app ships with no built-in
// source, mirroring the addon-agnostic stance of the YouTube integration.
const DEFAULT_CATEGORIES = "3000"
const PROVIDERS = ["prowlarr", "torznab"]
const MAX_RESULTS = 100
const REQUEST_TIMEOUT_MS = 15_000
// Prowlarr answers only after every indexer replied or timed out.
const PROWLARR_SEARCH_TIMEOUT_MS = 60_000
const FORMAT_TOKEN = /^(FLAC|MP3|AAC|OGG|OPUS|WAV|M4A|ALAC|LOSSLESS|\d{2,3}\s*[-~]?\s*K?BPS|V\d|VBR|CBR)/i
const MAGNET_PREFIX = /^magnet:\?/i

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true })

// Settings are persisted inside the library preferences; anything invalid
// falls back to defaults so a corrupted file never breaks the app. Configs
// saved before providers existed were Torznab endpoints.
// The top-level url/apiKey/categories are the active provider's; `profiles`
// keeps each provider's own fields so switching providers never mixes them.
function cleanConnection(value) {
  let url = ""
  if (typeof value?.url === "string") {
    const candidate = value.url.trim()
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.toString()
    } catch { /* keep empty */ }
  }
  const apiKey = typeof value?.apiKey === "string" ? value.apiKey.trim().slice(0, 200) : ""
  const categories = typeof value?.categories === "string" && /^(\d{1,5})(,\d{1,5})*$/.test(value.categories.trim()) ? value.categories.trim() : DEFAULT_CATEGORIES
  return { url, apiKey, categories }
}

function cleanDiscoverSettings(value) {
  const provider = PROVIDERS.includes(value?.provider) ? value.provider : "torznab"
  const active = cleanConnection(value)
  const profiles = {}
  for (const name of PROVIDERS) {
    const saved = value?.profiles?.[name]
    if (name === provider) profiles[name] = active
    else if (saved && typeof saved === "object") profiles[name] = cleanConnection(saved)
  }
  return { provider, ...active, profiles, noticeAccepted: value?.noticeAccepted === true }
}

function isDiscoverConfigured(settings) {
  return Boolean(settings?.url && settings?.apiKey)
}

// Download links handed out by the indexer manager (Prowlarr /download proxy,
// Jackett /dl proxy) live on the configured origin; only those are fetched.
function isIndexerUrl(settings, value) {
  try { return Boolean(settings?.url) && new URL(value).origin === new URL(settings.url).origin } catch { return false }
}

function cleanTitle(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim().slice(0, 200)
}

// Parses release names such as "Artist - Album (2019) [FLAC] {Group}" into
// display fields. Purely heuristic: the raw title is always kept alongside.
function parseTorrentName(raw) {
  const original = cleanTitle(raw)
  const year = original.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? ""
  let format = ""
  let stripped = original.replace(/\[[^\]]*\]|\{[^}]*\}/g, " ")
  for (const block of original.matchAll(/\[([^\]]+)\]|\{([^}]+)\}/g)) {
    const inner = (block[1] ?? block[2] ?? "").trim()
    if (!format && FORMAT_TOKEN.test(inner)) format = inner.slice(0, 24).toUpperCase()
  }
  stripped = stripped.replace(/\((?:19|20)\d{2}\)/g, " ").replace(/\s{2,}/g, " ").trim()
  const parts = stripped.split(/\s+[-–—]\s+/)
  const artist = parts.length > 1 ? parts[0].trim() : ""
  const album = (parts.length > 1 ? parts.slice(1).join(" - ") : stripped).trim()
  const display = [artist, album || original].filter(Boolean).join(" — ")
  return { artist, album, year, format, display: display || original }
}

function asArray(value) {
  if (value == null || value === "") return []
  return Array.isArray(value) ? value : [value]
}

function textOf(value) {
  return typeof value === "object" && value !== null ? value["#text"] : value
}

function isMagnet(value) {
  return typeof value === "string" && MAGNET_PREFIX.test(value)
}

function httpUrl(value) {
  if (typeof value !== "string" || /\s/.test(value.trim())) return ""
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
  } catch { return "" }
}

function attrMap(item) {
  const map = {}
  for (const attr of asArray(item.attr)) {
    if (attr && attr["@_name"]) map[attr["@_name"]] = attr["@_value"]
  }
  return map
}

// Magnets first (no extra request, carry trackers); then the download link.
// Per the Torznab spec <link>/<enclosure> are downloads and <comments> is
// the details page.
function pickSource(item, attrs) {
  for (const candidate of [attrs.magneturl, textOf(item.guid), textOf(item.link)]) {
    if (isMagnet(candidate)) return candidate
  }
  return httpUrl(item.enclosure?.["@_url"]) || httpUrl(textOf(item.link))
}

function toResult(item) {
  const raw = cleanTitle(item.title)
  if (!raw) return null
  const attrs = attrMap(item)
  const source = pickSource(item, attrs)
  if (!source) return null
  const seeders = Number.parseInt(attrs.seeders ?? "", 10)
  return {
    title: raw,
    ...parseTorrentName(raw),
    size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
    seeders: Number.isNaN(seeders) ? -1 : seeders,
    indexer: cleanTitle(textOf(item.jackettindexer ?? item.prowlarrindexer) ?? item.indexer ?? "").slice(0, 60),
    publishedAt: cleanTitle(item.pubDate ?? "").slice(0, 40),
    source,
  }
}

function rank(results) {
  return results.filter((item) => item && (item.seeders === -1 || item.seeders > 0)).sort((a, b) => b.seeders - a.seeders).slice(0, MAX_RESULTS)
}

// Flattens a Torznab RSS document into search results, best seeders first.
// Torznab errors (<error code description/>) often arrive with HTTP 200, so
// they are surfaced here with the indexer's own description.
function parseTorznab(xml) {
  let document
  try { document = xmlParser.parse(xml) } catch { throw new Error("A resposta do indexador não é um XML válido.") }
  const failure = document?.error
  if (failure && typeof failure === "object") {
    const description = cleanTitle(failure["@_description"]).slice(0, 300) || "erro sem descrição"
    throw new Error(`O indexador recusou a busca: ${description} (código ${cleanTitle(failure["@_code"]) || "?"})`)
  }
  const channel = document?.rss?.channel
  if (!channel) throw new Error("A resposta do indexador não contém resultados Torznab.")
  return { results: rank(asArray(channel.item).map(toResult)) }
}

// Prowlarr releases: proxied magnet/download links (both on the Prowlarr
// origin), usenet entries skipped, the same torrent from several indexers
// collapsed onto its best-seeded copy.
function fromProwlarr(release) {
  if (!release || (release.protocol !== "torrent" && release.protocol !== 2)) return null
  const raw = cleanTitle(release.title)
  if (!raw) return null
  const infoHash = typeof release.infoHash === "string" && /^[a-f0-9]{40}$/i.test(release.infoHash) ? release.infoHash.toLowerCase() : ""
  const source = [release.magnetUrl, release.downloadUrl, release.guid].find(isMagnet)
    || httpUrl(release.magnetUrl) || httpUrl(release.downloadUrl)
    || (infoHash ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(raw)}` : "")
  if (!source) return null
  return {
    title: raw,
    ...parseTorrentName(raw),
    size: Number.isFinite(Number(release.size)) ? Number(release.size) : 0,
    seeders: Number.isInteger(release.seeders) ? release.seeders : -1,
    indexer: cleanTitle(release.indexer).slice(0, 60),
    publishedAt: cleanTitle(release.publishDate).slice(0, 40),
    source,
    infoHash,
  }
}

function parseProwlarr(releases) {
  if (!Array.isArray(releases)) throw new Error("A resposta do Prowlarr não é uma lista de resultados.")
  const seen = new Set()
  const results = rank(releases.map(fromProwlarr)).filter((item) => {
    if (!item.infoHash) return true
    if (seen.has(item.infoHash)) return false
    seen.add(item.infoHash)
    return true
  })
  return { results: results.map(({ infoHash: _infoHash, ...item }) => item) }
}

function torznabEndpoint(settings, parameters) {
  const url = new URL(settings.url)
  url.search = ""
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  return url.toString()
}

// Accepts the bare Prowlarr address and tolerates pasted API or Torznab
// paths ("/api/v1", "/1/api"); a reverse-proxy base path is kept.
function prowlarrEndpoint(settings, route, parameters = {}) {
  const url = new URL(settings.url)
  const base = url.pathname.replace(/\/+$/, "").replace(/\/(\d+\/)?api(\/v\d+)?$/i, "")
  url.pathname = `${base}${route}`
  url.search = ""
  for (const [key, value] of Object.entries(parameters)) for (const item of asArray(value)) url.searchParams.append(key, String(item))
  return url.toString()
}

async function fetchText(endpoint, { headers = {}, timeoutMs = REQUEST_TIMEOUT_MS, service = "O indexador" } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers })
    if (response.status === 401 || response.status === 403) throw new Error(`A chave de API foi rejeitada: ${service.toLowerCase()} respondeu ${response.status}. Confira a chave nas configurações.`)
    if (!response.ok) {
      const detail = cleanTitle(await response.text().catch(() => "")).slice(0, 200)
      throw new Error(`${service} respondeu com o código ${response.status}.${detail ? ` ${detail}` : ""}`)
    }
    return await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${service} demorou demais para responder.`)
    if (error instanceof TypeError) throw new Error(`Não foi possível conectar a ${new URL(endpoint).host}. Verifique se o serviço está em execução e se o endereço está certo.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function prowlarrJson(settings, route, parameters, timeoutMs) {
  const text = await fetchText(prowlarrEndpoint(settings, route, parameters), { headers: { accept: "application/json", "X-Api-Key": settings.apiKey }, timeoutMs, service: "O Prowlarr" })
  try { return JSON.parse(text) } catch { throw new Error("O endereço respondeu, mas não parece ser o Prowlarr. Use o endereço base, por exemplo http://localhost:9696.") }
}

function requireConfigured(settings) {
  if (!isDiscoverConfigured(settings)) throw new Error("Configure o Prowlarr ou um endpoint Torznab antes de buscar.")
}

function requireTerm(query) {
  const term = String(query ?? "").trim()
  if (!term) throw new Error("Digite o nome de um artista, álbum ou música para buscar.")
  return term
}

// t=search is the one mode every Torznab indexer must support; t=music is
// optional and Jackett's aggregate rejects it unless all its indexers have it.
async function searchTorznab(settings, query) {
  requireConfigured(settings)
  const term = requireTerm(query)
  const endpoint = torznabEndpoint(settings, { apikey: settings.apiKey, t: "search", cat: settings.categories, q: term })
  return parseTorznab(await fetchText(endpoint, { headers: { accept: "application/xml" } }))
}

async function searchProwlarr(settings, query) {
  requireConfigured(settings)
  const term = requireTerm(query)
  const parameters = { query: term, type: "search", categories: settings.categories.split(","), limit: MAX_RESULTS }
  return parseProwlarr(await prowlarrJson(settings, "/api/v1/search", parameters, PROWLARR_SEARCH_TIMEOUT_MS))
}

// Connection test used by the settings sheet; t=caps is the Torznab
// capability query supported by both Prowlarr and Jackett.
async function testTorznab(settings) {
  requireConfigured(settings)
  const xml = await fetchText(torznabEndpoint(settings, { apikey: settings.apiKey, t: "caps" }), { headers: { accept: "application/xml" } })
  if (!/<caps[\s>]/i.test(xml)) throw new Error("O endpoint respondeu, mas não parece ser uma API Torznab. Confira a URL.")
  const indexers = await countConfiguredIndexers(settings)
  if (indexers === 0) throw new Error("O Jackett respondeu, mas não tem nenhum indexador configurado. Adicione indexadores no painel do Jackett (Add indexer) e teste de novo.")
  const categories = asArray(xml.match(/<category /g)).length
  const hints = [indexers ? `${indexers} indexador(es) configurado(s)` : "", categories ? `${categories} categoria(s) anunciadas` : ""].filter(Boolean)
  return { ok: true, hint: hints.join(", ") || "Resposta Torznab válida" }
}

// Jackett's aggregate endpoints ("all", tag filters) answer t=indexers; an
// empty list means every search will return nothing. Other endpoints reject
// the query, which is reported as "unknown" (null).
async function countConfiguredIndexers(settings) {
  try {
    const xml = await fetchText(torznabEndpoint(settings, { apikey: settings.apiKey, t: "indexers", configured: "true" }))
    if (!/<indexers[\s>/]/i.test(xml)) return null
    return asArray(xml.match(/<indexer\s/g)).length
  } catch { return null }
}

async function testProwlarr(settings) {
  requireConfigured(settings)
  const status = await prowlarrJson(settings, "/api/v1/system/status")
  if (status?.appName !== "Prowlarr") throw new Error("O endereço respondeu, mas não é o Prowlarr. Use o endereço base, por exemplo http://localhost:9696.")
  const indexers = await prowlarrJson(settings, "/api/v1/indexer")
  const active = (Array.isArray(indexers) ? indexers : []).filter((indexer) => indexer?.enable && (indexer.protocol === "torrent" || indexer.protocol === 2)).length
  if (!active) throw new Error("O Prowlarr respondeu, mas não tem nenhum indexador de torrent ativo. Adicione indexadores em Indexers → Add Indexer e teste de novo.")
  return { ok: true, hint: `Prowlarr ${cleanTitle(status.version).slice(0, 20)}, ${active} indexador(es) de torrent ativo(s)` }
}

const searchDiscover = (settings, query) => settings?.provider === "prowlarr" ? searchProwlarr(settings, query) : searchTorznab(settings, query)
const testDiscover = (settings) => settings?.provider === "prowlarr" ? testProwlarr(settings) : testTorznab(settings)

module.exports = {
  DEFAULT_CATEGORIES,
  cleanDiscoverSettings,
  isDiscoverConfigured,
  isIndexerUrl,
  parseTorrentName,
  parseTorznab,
  parseProwlarr,
  torznabEndpoint,
  prowlarrEndpoint,
  searchTorznab,
  searchProwlarr,
  searchDiscover,
  testTorznab,
  testProwlarr,
  testDiscover,
}
