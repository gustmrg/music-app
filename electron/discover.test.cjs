const test = require("node:test")
const assert = require("node:assert/strict")
const {
  cleanDiscoverSettings,
  parseTorrentName,
  parseTorznab,
  torznabEndpoint,
  isDiscoverConfigured,
  isIndexerUrl,
  parseProwlarr,
  prowlarrEndpoint,
  searchTorznab,
  searchDiscover,
  testTorznab,
  testDiscover,
} = require("./discover.cjs")

test("cleanDiscoverSettings keeps valid endpoints and defaults the rest", () => {
  const settings = cleanDiscoverSettings({ url: " http://127.0.0.1:9696/api/v1/torznab/1 ", apiKey: " abc ", categories: "3000,3040", noticeAccepted: true })
  assert.equal(settings.url, "http://127.0.0.1:9696/api/v1/torznab/1")
  assert.equal(settings.apiKey, "abc")
  assert.equal(settings.categories, "3000,3040")
  assert.equal(settings.noticeAccepted, true)
})

test("cleanDiscoverSettings rejects invalid input", () => {
  const settings = cleanDiscoverSettings({ url: "not a url", apiKey: 42, categories: "flac" })
  assert.equal(settings.url, "")
  assert.equal(settings.apiKey, "")
  assert.equal(settings.categories, "3000")
  assert.equal(settings.noticeAccepted, false)
  assert.equal(isDiscoverConfigured(settings), false)
})

test("parseTorrentName extracts artist, album, year and format", () => {
  const parsed = parseTorrentName("Radiohead - In Rainbows (2007) [FLAC] {SomeGroup}")
  assert.equal(parsed.artist, "Radiohead")
  assert.equal(parsed.album, "In Rainbows")
  assert.equal(parsed.year, "2007")
  assert.equal(parsed.format, "FLAC")
  assert.equal(parsed.display, "Radiohead — In Rainbows")
})

test("parseTorrentName survives names without separators", () => {
  const parsed = parseTorrentName("SomeAlbumName 2023 MP3")
  assert.equal(parsed.artist, "")
  assert.ok(parsed.display)
})

test("parseTorznab flattens items, prefers magnets, sorts by seeders", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>A - AlbumOne (2020) [FLAC]</title>
      <guid>magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567</guid>
      <link>http:// indexer.invalid/details/1</link>
      <size>1048576</size>
      <pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>
      <torznab:attr name="seeders" value="7"/>
      <torznab:attr name="leechers" value="1"/>
    </item>
    <item>
      <title>B - AlbumTwo (2021) [MP3]</title>
      <guid isPermaLink="false">magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff</guid>
      <size>2097152</size>
      <torznab:attr name="seeders" value="32"/>
    </item>
    <item>
      <title>C - DeadTorrent</title>
      <guid>magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</guid>
      <torznab:attr name="seeders" value="0"/>
    </item>
    <item>
      <title>D - NoMagnet</title>
      <link>http:// indexer.invalid/no-magnet</link>
    </item>
  </channel>
</rss>`
  const { results } = parseTorznab(xml)
  assert.equal(results.length, 2)
  assert.equal(results[0].title.startsWith("B"), true)
  assert.equal(results[0].seeders, 32)
  assert.equal(results[1].seeders, 7)
  assert.equal(results[0].source.startsWith("magnet:"), true)
  assert.equal(results[0].format, "MP3")
})

test("parseTorznab throws on non-Torznab payloads", () => {
  assert.throws(() => parseTorznab("<html><body>login page</body></html>"), /não é um XML válido|Torznab/)
  assert.throws(() => parseTorznab("<rss><channel></channel></rss>"), /Torznab/)
})

test("torznabEndpoint appends parameters without duplicating the path", () => {
  const endpoint = torznabEndpoint({ url: "http://127.0.0.1:9696/prowlarr/1/torznab/?stale=1" }, { apikey: "k", t: "music", cat: "3000", q: "a b" })
  assert.equal(endpoint, "http://127.0.0.1:9696/prowlarr/1/torznab/?apikey=k&t=music&cat=3000&q=a+b")
})

test("parseTorznab surfaces Torznab error documents sent with HTTP 200", () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<error code="201" description="all does not support the requested query." />'
  assert.throws(() => parseTorznab(xml), /recusou a busca: all does not support the requested query\. \(código 201\)/)
})

// Stubs fetch with canned Torznab answers keyed by the t= parameter.
function stubFetch(t, answers) {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    const parsed = new URL(url)
    requests.push(parsed)
    const body = answers[parsed.searchParams.get("t")]
    return body === undefined ? new Response("<error code=\"202\" description=\"No such function\" />", { status: 200 }) : new Response(body, { status: 200 })
  }
  t.after(() => { globalThis.fetch = original })
  return requests
}

const jackett = { url: "http://127.0.0.1:9117/api/v2.0/indexers/all/results/torznab/", apiKey: "k", categories: "3000" }
const emptyRss = "<rss><channel><title>AggregateSearch</title></channel></rss>"

test("searchTorznab uses the mandatory t=search mode with the music categories", async (t) => {
  const requests = stubFetch(t, { search: emptyRss })
  assert.deepEqual(await searchTorznab(jackett, " linkin park "), { results: [] })
  assert.equal(requests[0].searchParams.get("t"), "search")
  assert.equal(requests[0].searchParams.get("cat"), "3000")
  assert.equal(requests[0].searchParams.get("q"), "linkin park")
})

test("testTorznab reports a Jackett aggregate without configured indexers", async (t) => {
  stubFetch(t, { caps: "<caps><categories><category id=\"3000\" /></categories></caps>", indexers: "<indexers />" })
  await assert.rejects(testTorznab(jackett), /nenhum indexador configurado/)
})

test("testTorznab counts configured indexers and tolerates endpoints without t=indexers", async (t) => {
  stubFetch(t, { caps: "<caps><category id=\"3000\" /></caps>", indexers: "<indexers><indexer id=\"a\" configured=\"true\"></indexer><indexer id=\"b\" configured=\"true\"></indexer></indexers>" })
  assert.equal((await testTorznab(jackett)).hint, "2 indexador(es) configurado(s), 1 categoria(s) anunciadas")
})

test("testTorznab accepts endpoints that reject t=indexers", async (t) => {
  stubFetch(t, { caps: "<caps><category id=\"3000\" /></caps>" })
  assert.equal((await testTorznab(jackett)).hint, "1 categoria(s) anunciadas")
})

test("cleanDiscoverSettings keeps the provider and defaults old configs to Torznab", () => {
  assert.equal(cleanDiscoverSettings({ url: "http://localhost:9117/x" }).provider, "torznab")
  assert.equal(cleanDiscoverSettings({ provider: "prowlarr" }).provider, "prowlarr")
  assert.equal(cleanDiscoverSettings({ provider: "lidarr" }).provider, "torznab")
})

test("cleanDiscoverSettings keeps a separate profile per provider", () => {
  const settings = cleanDiscoverSettings({
    provider: "prowlarr", url: "http://localhost:9696", apiKey: "p", categories: "3000",
    profiles: { torznab: { url: "http://localhost:9117/x", apiKey: "j", categories: "3040" }, prowlarr: { url: "http://stale", apiKey: "old" }, lidarr: { url: "http://x" } },
  })
  assert.deepEqual(settings.profiles.prowlarr, { url: "http://localhost:9696/", apiKey: "p", categories: "3000" })
  assert.deepEqual(settings.profiles.torznab, { url: "http://localhost:9117/x", apiKey: "j", categories: "3040" })
  assert.equal(settings.profiles.lidarr, undefined)
})

test("cleanDiscoverSettings migrates old flat configs into the active profile", () => {
  const settings = cleanDiscoverSettings({ url: "http://localhost:9117/x", apiKey: "j" })
  assert.deepEqual(settings.profiles, { torznab: { url: "http://localhost:9117/x", apiKey: "j", categories: "3000" } })
})

test("parseTorznab prefers the magneturl attribute and accepts enclosure downloads", () => {
  const xml = `<rss><channel>
    <item><title>A - One</title><link>http://localhost:9117/dl/x/?jackett_apikey=k&amp;path=p</link><torznab:attr name="seeders" value="3"/><torznab:attr name="magneturl" value="magnet:?dn=One&amp;xt=urn:btih:0123456789abcdef0123456789abcdef01234567"/><jackettindexer id="x">Some Tracker</jackettindexer></item>
    <item><title>B - Two</title><enclosure url="http://localhost:9696/1/download?apikey=k&amp;link=l" length="1" type="application/x-bittorrent"/><torznab:attr name="seeders" value="2"/></item>
  </channel></rss>`
  const { results } = parseTorznab(xml)
  assert.equal(results[0].source, "magnet:?dn=One&xt=urn:btih:0123456789abcdef0123456789abcdef01234567")
  assert.equal(results[0].indexer, "Some Tracker")
  assert.equal(results[1].source, "http://localhost:9696/1/download?apikey=k&link=l")
})

test("prowlarrEndpoint accepts the base address, pasted API paths, and proxy prefixes", () => {
  const route = (url) => prowlarrEndpoint({ url }, "/api/v1/search", { query: "a b", categories: ["3000", "3040"] })
  assert.equal(route("http://localhost:9696"), "http://localhost:9696/api/v1/search?query=a+b&categories=3000&categories=3040")
  assert.equal(route("http://localhost:9696/api/v1/"), "http://localhost:9696/api/v1/search?query=a+b&categories=3000&categories=3040")
  assert.equal(route("http://localhost:9696/1/api"), "http://localhost:9696/api/v1/search?query=a+b&categories=3000&categories=3040")
  assert.equal(route("https://home.lan/prowlarr/"), "https://home.lan/prowlarr/api/v1/search?query=a+b&categories=3000&categories=3040")
})

test("parseProwlarr keeps torrents, prefers magnets, and collapses duplicates across indexers", () => {
  const hash = "0123456789abcdef0123456789abcdef01234567"
  const { results } = parseProwlarr([
    { protocol: "usenet", title: "A - Album [FLAC]", downloadUrl: "http://localhost:9696/2/download?x", seeders: null },
    { protocol: "torrent", title: "A - Album [FLAC]", infoHash: hash.toUpperCase(), magnetUrl: "http://localhost:9696/1/download?apikey=k&link=m", downloadUrl: "http://localhost:9696/1/download?apikey=k&link=d", seeders: 5, indexer: "One", size: 10, publishDate: "2026-01-01T00:00:00Z" },
    { protocol: "torrent", title: "A - Album [FLAC] (mirror)", infoHash: hash, downloadUrl: "http://localhost:9696/3/download?apikey=k&link=d", seeders: 40, indexer: "Three" },
    { protocol: "torrent", title: "B - Raw", magnetUrl: "magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff", downloadUrl: "http://localhost:9696/4/download?x", seeders: 9 },
    { protocol: "torrent", title: "C - Hash only", infoHash: "a".repeat(40), seeders: 1 },
    { protocol: "torrent", title: "D - Dead", magnetUrl: "magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", seeders: 0 },
    { protocol: "torrent", title: "E - Nothing", seeders: 3 },
  ])
  assert.deepEqual(results.map((item) => [item.title, item.indexer, item.source]), [
    ["A - Album [FLAC] (mirror)", "Three", "http://localhost:9696/3/download?apikey=k&link=d"],
    ["B - Raw", "", "magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff"],
    ["C - Hash only", "", `magnet:?xt=urn:btih:${"a".repeat(40)}&dn=C%20-%20Hash%20only`],
  ])
  assert.equal("infoHash" in results[0], false)
  assert.throws(() => parseProwlarr({ message: "nope" }), /não é uma lista/)
})

// Stubs fetch with JSON answers keyed by URL path, recording each request.
function stubProwlarr(t, routes) {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url)
    requests.push({ url: parsed, headers: options.headers ?? {} })
    const body = routes[parsed.pathname]
    return body === undefined ? new Response("Not Found", { status: 404 }) : new Response(JSON.stringify(body), { status: 200 })
  }
  t.after(() => { globalThis.fetch = original })
  return requests
}

const prowlarr = { provider: "prowlarr", url: "http://localhost:9696", apiKey: "k", categories: "3000,3040" }

test("searchDiscover uses Prowlarr's native search with the API key header", async (t) => {
  const requests = stubProwlarr(t, { "/api/v1/search": [{ protocol: "torrent", title: "Linkin Park - Meteora", magnetUrl: "magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff", seeders: 12 }] })
  const { results } = await searchDiscover(prowlarr, "linkin park")
  assert.equal(results[0].artist, "Linkin Park")
  assert.equal(requests[0].headers["X-Api-Key"], "k")
  assert.equal(requests[0].url.searchParams.get("query"), "linkin park")
  assert.equal(requests[0].url.searchParams.get("type"), "search")
  assert.deepEqual(requests[0].url.searchParams.getAll("categories"), ["3000", "3040"])
  assert.equal(requests[0].url.searchParams.has("apikey"), false)
})

test("testDiscover checks that the address is Prowlarr and has active torrent indexers", async (t) => {
  stubProwlarr(t, { "/api/v1/system/status": { appName: "Prowlarr", version: "2.0.5" }, "/api/v1/indexer": [{ enable: true, protocol: "torrent" }, { enable: false, protocol: "torrent" }, { enable: true, protocol: "usenet" }] })
  assert.equal((await testDiscover(prowlarr)).hint, "Prowlarr 2.0.5, 1 indexador(es) de torrent ativo(s)")
})

test("testDiscover reports Prowlarr without indexers and non-Prowlarr addresses", async (t) => {
  const routes = { "/api/v1/system/status": { appName: "Prowlarr", version: "2.0.5" }, "/api/v1/indexer": [] }
  stubProwlarr(t, routes)
  await assert.rejects(testDiscover(prowlarr), /nenhum indexador de torrent ativo/)
  routes["/api/v1/system/status"] = { appName: "Sonarr" }
  await assert.rejects(testDiscover(prowlarr), /não é o Prowlarr/)
})

test("isIndexerUrl only vouches for links on the configured origin", () => {
  assert.equal(isIndexerUrl(prowlarr, "http://localhost:9696/1/download?apikey=k"), true)
  assert.equal(isIndexerUrl(prowlarr, "http://localhost:9117/dl/x"), false)
  assert.equal(isIndexerUrl(prowlarr, "not a url"), false)
  assert.equal(isIndexerUrl({ url: "" }, "http://localhost:9696/x"), false)
})
