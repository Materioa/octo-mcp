import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function Collapsible({ open, onOpenChange, children, className }: CollapsibleProps) {
  return (
    <div className={className}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        if (child.type === CollapsibleTrigger) {
          return React.cloneElement(child as React.ReactElement<any>, { onClick: () => onOpenChange(!open) });
        }
        if (child.type === CollapsibleContent) {
          return open ? child : null;
        }
        return child;
      })}
    </div>
  );
}

function CollapsibleTrigger({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button className={cn("w-full text-left", className)} onClick={onClick}>
      {children}
    </button>
  );
}

function CollapsibleContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden", className)} {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
