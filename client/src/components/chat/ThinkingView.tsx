import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { OriginalThinkingLoader } from "./OriginalThinkingLoader";
import { ClockFading, ChevronDown, X } from "lucide-react";

interface ThinkingViewProps {
  thoughts: string[];
  isStreaming?: boolean;
}

export function ThinkingView({ thoughts, isStreaming }: ThinkingViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const [shimmerIndex, setShimmerIndex] = useState(0);
  const shimmerPhrases = [
    "Analyzing the request...",
    "Formulating a plan...",
    "Thinking deeply...",
    "Reasoning about steps..."
  ];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setShimmerIndex(i => (i + 1) % shimmerPhrases.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isStreaming, shimmerPhrases.length]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const trigger = (
    <button 
      onClick={() => setIsOpen(!isOpen)}
      className="flex w-fit items-center gap-2 px-1 py-1.5 hover:bg-muted/40 rounded transition-colors text-[13px] font-medium text-muted-foreground/80 mb-2"
    >
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <OriginalThinkingLoader className="h-7 w-7 shrink-0 text-brand" />
        ) : (
          <ClockFading className="w-[14px] h-[14px] shrink-0 opacity-70" strokeWidth={2} />
        )}
        {isStreaming ? (
          <span className="opacity-90 animate-shimmer-text font-medium">
            {shimmerPhrases[shimmerIndex]}
          </span>
        ) : "Thought process"}
      </div>
      <ChevronDown className={cn("w-[14px] h-[14px] transition-transform duration-200 opacity-50 ml-1", isOpen ? "rotate-180" : "")} />
    </button>
  );

  const content = (
    <div className="py-2 text-[13px] text-muted-foreground/90 font-mono whitespace-pre-wrap leading-relaxed">
      {thoughts.map((t, i) => (
        <div key={i} className={i > 0 ? "mt-4 pt-4 border-t border-border/50" : ""}>
          {t}
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full max-w-2xl">
      {trigger}
      
      {/* Desktop Inline Accordion */}
      {!isMobile && isOpen && (
        <div className="pl-3 border-l-2 border-border/50 max-h-[500px] overflow-y-auto mb-4">
          {content}
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isMobile && (isOpen || isClosing) && (
        <>
          <div 
            className={cn("fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300", isClosing && "animate-out fade-out opacity-0")}
            onClick={handleClose}
          />
          <div className={cn("fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-background shadow-lg animate-in slide-in-from-bottom-full duration-300", isClosing && "animate-out slide-out-to-bottom-full")}>
            <div className="flex items-center justify-center p-3 border-b border-border/50">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-semibold flex items-center gap-2">
                <ClockFading className="w-4 h-4 text-brand animate-pulse" strokeWidth={2} />
                Thought process
              </h3>
              <button onClick={handleClose} className="p-2 -mr-2 text-muted-foreground hover:bg-accent rounded-full transition-colors">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-muted/5">
              {content}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
