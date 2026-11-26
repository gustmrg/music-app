import { useEffect, useState } from "react"
import { Download, ExternalLink, Loader2, RefreshCw, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { errorMessage, type UpdateState } from "@/library"

export function UpdateSettings() {
  const desktop = window.desktop
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!desktop) return
    let active = true
    const unsubscribe = desktop.onUpdateState(setState)
    // An event that arrives first is newer than this snapshot.
    desktop.updateState().then((value) => { if (active) setState((current) => current ?? value) }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [desktop])

  if (!desktop) return <p className="muted">Disponível no aplicativo desktop.</p>
  if (!state) return <p className="muted">Carregando…</p>

  const run = (action: () => Promise<void>, fallback: string) => {
    setError("")
    action().catch((error) => setError(errorMessage(error, fallback)))
  }
  const check = <Button variant="outline" disabled={state.status === "checking"} onClick={() => run(desktop.checkForUpdate, "Não foi possível verificar atualizações.")}>{state.status === "checking" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}Verificar atualizações</Button>
  const releasePage = (label: string) => <Button variant="outline" onClick={() => run(desktop.openReleaseNotes, "Não foi possível abrir a página da versão.")}><ExternalLink size={16} />{label}</Button>

  return <div className="update-settings">
    <p>Versão instalada: <strong>{state.current}</strong></p>
    {state.status === "unsupported" ? <p className="muted">As atualizações funcionam apenas no aplicativo instalado.</p> : null}
    {state.status === "idle" || state.status === "checking" || state.status === "current" || state.status === "failed" ? <>
      <p className="muted">Procura uma versão nova no GitHub. Nada é baixado sem a sua confirmação.</p>
      <div className="update-actions">{check}</div>
      {state.status === "current" ? <p className="muted discover-ok" role="status">Você já está na versão mais recente.</p> : null}
      {state.status === "failed" ? <p className="muted discover-error" role="alert">{state.message}</p> : null}
    </> : null}
    {state.status === "available" ? <>
      <p role="status">A versão <strong>{state.version}</strong> está disponível.</p>
      <div className="update-actions">
        <Button onClick={() => run(desktop.downloadUpdate, "Não foi possível baixar a atualização.")}><Download size={16} />Baixar atualização</Button>
        {releasePage("Ver novidades")}
      </div>
      {state.error ? <p className="muted discover-error" role="alert">{state.error}</p> : null}
    </> : null}
    {state.status === "manual" ? <>
      <p role="status">A versão <strong>{state.version}</strong> está disponível.</p>
      <p className="muted">Este app não tem assinatura da Apple e não pode se atualizar sozinho. Baixe o DMG na página da versão e substitua o Playmio em Aplicativos.</p>
      <div className="update-actions">{releasePage("Abrir página da versão")}</div>
    </> : null}
    {state.status === "downloading" ? <>
      <p role="status">Baixando a versão <strong>{state.version}</strong>… {state.percent}%</p>
      <progress className="update-progress" max={100} value={state.percent} aria-label="Progresso do download da atualização" />
    </> : null}
    {state.status === "downloaded" || state.status === "installing" ? <>
      <p className="discover-ok" role="status">A versão {state.version} foi baixada e conferida.</p>
      <p className="muted">O Playmio fecha, instala a atualização e abre de novo. Sua biblioteca é mantida.{desktop.platform === "linux" ? " Se você instalou pelo pacote .deb, o sistema pede a sua senha." : ""}</p>
      <div className="update-actions">
        <Button disabled={state.status === "installing"} onClick={() => run(desktop.installUpdate, "Não foi possível instalar a atualização.")}>{state.status === "installing" ? <Loader2 className="spin" size={16} /> : <RotateCw size={16} />}Reiniciar e instalar</Button>
        {releasePage("Ver novidades")}
      </div>
    </> : null}
    {error ? <p className="muted discover-error" role="alert">{error}</p> : null}
  </div>
}
