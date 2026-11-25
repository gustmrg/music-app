import { Component, type ErrorInfo, type ReactNode } from "react"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = { children: ReactNode }
type State = { hasError: boolean }

// Catches unexpected render failures so the window shows a recovery action
// instead of a blank screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled interface error:", error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return <div className="empty-state" role="alert">
      <h2>Algo deu errado na interface</h2>
      <p>Ocorreu um erro inesperado ao exibir esta tela. Suas músicas e biblioteca continuam intactas.</p>
      <Button onClick={() => window.location.reload()}><RotateCw size={16} />Recarregar aplicativo</Button>
    </div>
  }
}
