import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InfoTip } from "@/components/ui/info-tip"
import { errorMessage, type DiscoverConnection, type DiscoverProvider, type DiscoverSettings } from "@/library"

export function IndexerSettings({ settings, onSave, loaded }: { settings: DiscoverSettings; onSave: (settings: DiscoverSettings) => void; loaded: boolean }) {
  const [draft, setDraft] = useState(settings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState("")

  const prowlarr = draft.provider === "prowlarr"
  const connection = (): DiscoverConnection => ({ url: draft.url.trim(), apiKey: draft.apiKey.trim(), categories: draft.categories.trim() || "3000" })
  const cleaned = (): DiscoverSettings => ({ ...draft, ...connection(), profiles: { ...draft.profiles, [draft.provider]: connection() } })
  // Each provider keeps its own address, key and categories in the draft.
  const switchProvider = (provider: DiscoverProvider) => {
    if (provider === draft.provider) return
    const profiles = { ...draft.profiles, [draft.provider]: { url: draft.url, apiKey: draft.apiKey, categories: draft.categories } }
    setDraft({ ...draft, ...(profiles[provider] ?? { url: "", apiKey: "", categories: "3000" }), provider, profiles })
    setTestResult("")
  }
  const save = () => {
    onSave(cleaned())
    setTestResult("Configurações do indexador salvas.")
  }

  const test = async () => {
    if (!window.desktop) return
    setTesting(true)
    setTestResult("")
    try {
      const { hint } = await window.desktop.testDiscover(cleaned())
      setTestResult(`Conexão OK — ${hint}.`)
    } catch (error) {
      setTestResult(errorMessage(error, "Falha ao conectar."))
    } finally { setTesting(false) }
  }

  return <form className="indexer-form" onSubmit={(event) => { event.preventDefault(); save() }}>
    <p className="muted">Conecte o seu Prowlarr ou Jackett. Nada é buscado sem esta configuração.</p>
    <fieldset disabled={!window.desktop || !loaded || testing}>
      <div className="provider-toggle" role="group" aria-label="Tipo de indexador">
        <Button type="button" size="sm" variant={prowlarr ? "default" : "outline"} aria-pressed={prowlarr} onClick={() => switchProvider("prowlarr")}>Prowlarr</Button>
        <Button type="button" size="sm" variant={prowlarr ? "outline" : "default"} aria-pressed={!prowlarr} onClick={() => switchProvider("torznab")}>Torznab (Jackett)</Button>
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-url">{prowlarr ? "Endereço do Prowlarr" : "Endpoint Torznab"}</label><InfoTip label="Ajuda sobre o endereço">{prowlarr ? "Use o endereço base do Prowlarr. A busca usa a API do próprio Prowlarr e consulta todos os indexadores ativos de uma vez." : "Para buscar em todos os indexadores do Jackett: http://localhost:9117/api/v2.0/indexers/all/results/torznab/"}</InfoTip></div>
        <Input id="indexer-url" required value={draft.url} onChange={(event) => { setTestResult(""); setDraft({ ...draft, url: event.target.value }) }} placeholder={prowlarr ? "http://localhost:9696" : "http://localhost:9117/api/v2.0/indexers/all/results/torznab/"} />
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-key">Chave de API</label><InfoTip label="Onde encontrar a chave de API">{prowlarr ? "No Prowlarr: Settings → General → Security → API Key." : "No Jackett: aparece no topo do painel."}</InfoTip></div>
        <Input id="indexer-key" required type="password" value={draft.apiKey} onChange={(event) => { setTestResult(""); setDraft({ ...draft, apiKey: event.target.value }) }} />
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-categories">Categorias</label><InfoTip label="Ajuda sobre categorias">Padrão 3000 (Música). Use 3000,3010,3040 para buscar só MP3 e FLAC.</InfoTip></div>
        <Input id="indexer-categories" value={draft.categories} onChange={(event) => { setTestResult(""); setDraft({ ...draft, categories: event.target.value }) }} placeholder="3000" />
      </div>
      {testResult ? <p className={`muted ${(testResult.startsWith("Conexão OK") || testResult.endsWith("salvas.")) ? "discover-ok" : "discover-error"}`} role="status">{testResult}</p> : null}
      <div className="sheet-actions">
        <Button type="submit" disabled={!draft.url.trim() || !draft.apiKey.trim()}>Salvar</Button>
        <Button type="button" variant="outline" disabled={testing || !draft.url.trim() || !draft.apiKey.trim()} onClick={() => void test()}>{testing ? <Loader2 className="spin" size={14} /> : null}Testar conexão</Button>
        <Button type="button" variant="ghost" onClick={() => { setDraft(settings); setTestResult("") }}>Descartar alterações</Button>
      </div>
      <p className="muted">Streams por torrent participam da rede BitTorrent: seu IP é visto pelos pares. Nada é semeado depois de tocar ou salvar, e o cache é apagado.</p>
    </fieldset>
    {!window.desktop ? <p className="muted">A conexão com indexadores está disponível no aplicativo desktop.</p> : null}
  </form>
}
