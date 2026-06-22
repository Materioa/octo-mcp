import * as React from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  fullScreen?: boolean;
}

function Dialog({ open, onOpenChange, children, fullScreen }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;
  
  // Render the dialog into the document body to prevent CSS transform scoping
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in-0"
        onClick={() => onOpenChange(false)}
      />
      <div className={cn(
        "fixed inset-0 flex justify-center pointer-events-none",
        fullScreen ? "items-end sm:items-center justify-center p-0 sm:p-4 max-sm:items-stretch max-sm:p-0" : "items-end sm:items-center justify-center p-0 sm:p-4"
      )}>
        {children}
      </div>
    </div>,
    document.body
  );
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void; fullScreen?: boolean }
>((({ className, children, onClose, fullScreen, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative z-50 flex w-full flex-col border bg-background p-6 shadow-2xl pointer-events-auto",
      "max-w-lg max-h-[90vh] sm:max-h-[min(85vh,700px)] rounded-t-[28px] sm:rounded-2xl border-b-0 sm:border-b squircle-mask squircle-t-[28px] sm:squircle-2xl",
      fullScreen 
        ? "max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0 max-sm:pb-0 max-sm:px-0 max-sm:squircle-mask-none max-sm:rounded-t-none max-sm:squircle-t-none" 
        : "max-sm:pb-10 max-sm:px-5",
      "animate-in slide-in-from-bottom-[100%] sm:zoom-in-95 sm:fade-in-0 duration-300 ease-out",
      className
    )}
    {...props}
  >
    <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0 h-full">
      {children}
    </div>
    {onClose && (
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 shrink-0 z-[100]"
        onClick={onClose}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </Button>
    )}
  </div>
)));
DialogContent.displayName = "DialogContent";

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription };
