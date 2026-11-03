import type { ReactNode } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import { Info } from "lucide-react"

// Small (i) button that reveals help text on hover and on keyboard focus.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger delay={150} type="button" className="info-tip" aria-label={label}><Info size={14} /></Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner side="top" sideOffset={6} className="info-tip-positioner">
        <Tooltip.Popup className="info-tip-popup">{children}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
}
