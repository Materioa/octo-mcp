import { useAlertStore } from "@/stores/alert";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function GlobalAlert() {
  const { alerts, removeAlert } = useAlertStore();

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 md:left-auto z-[100] flex flex-col gap-2 md:max-w-md md:w-full">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-3 squircle-mask squircle-lg border p-4 shadow-lg animate-in slide-in-from-top-2",
            alert.type === "error" || alert.type === "warning"
              ? "bg-[#fef3c7] border-[#fde68a] text-[#92400e]"
              : "bg-card border-border text-foreground"
          )}
        >
          {alert.type === "warning" || alert.type === "error" ? (
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          ) : null}
          <div className="flex-1 text-sm font-medium leading-relaxed">
            {alert.message}
          </div>
          <button
            onClick={() => removeAlert(alert.id)}
            className="shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
