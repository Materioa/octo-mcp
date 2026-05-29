import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { OriginalThinkingLoader } from "./OriginalThinkingLoader";

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
    "Searching memory...",
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
          <OriginalThinkingLoader className="h-4 w-4 shrink-0 text-brand" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse shrink-0 opacity-70"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        )}
        {isStreaming ? (
          <span 
            className="animate-[shimmer_2.5s_infinite_linear] bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent"
          >
            {shimmerPhrases[shimmerIndex]}
          </span>
        ) : "Thought Process"}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform duration-200 opacity-50 ml-1", isOpen ? "rotate-180" : "")}><path d="m6 9 6 6 6-6"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand animate-pulse"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Internal Thoughts
              </h3>
              <button onClick={handleClose} className="p-2 -mr-2 text-muted-foreground hover:bg-accent rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
