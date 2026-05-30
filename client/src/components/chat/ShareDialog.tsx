import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Globe, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibility: "private" | "public";
  conversationId: string;
  onSaveVisibility: (visibility: "private" | "public") => Promise<void>;
}

export function ShareDialog({ open, onOpenChange, visibility, conversationId, onSaveVisibility }: ShareDialogProps) {
  const [selected, setSelected] = useState<"private" | "public">(visibility);
  const [hasCopied, setHasCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync prop to state when dialog opens or visibility changes externally
  useEffect(() => {
    if (open) {
      setSelected(visibility);
      setHasCopied(false);
    }
  }, [open, visibility]);

  const handleSelect = async (newVisibility: "private" | "public") => {
    if (newVisibility === selected) return;
    
    setSelected(newVisibility);
    setHasCopied(false);
    setIsSaving(true);
    
    try {
      await onSaveVisibility(newVisibility);
    } catch (err) {
      console.error(err);
      setSelected(visibility);
    } finally {
      setIsSaving(false);
    }
  };

  const linkUrl = `${window.location.origin}${selected === "public" ? "/share/" : "/c/"}${conversationId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(linkUrl);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const isSharedState = selected === "public";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-[#242424] text-[#E0E0E0] border-[#3F3F3F] p-6 shadow-2xl !rounded-[24px]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-[22px] font-medium text-white">
            {isSharedState ? "Chat shared" : "Share chat"}
          </DialogTitle>
          <DialogDescription className="text-[15px] text-[#A0A0A0] mt-1">
            {isSharedState ? "Future messages aren't included" : "Only messages up to this point will be shared."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col border border-[#3F3F3F] rounded-2xl overflow-hidden bg-transparent mt-2">
          <button
            onClick={() => handleSelect("private")}
            disabled={isSaving}
            className={cn(
              "flex items-center gap-3 p-4 text-left transition-colors hover:bg-[#2E2E2E]",
              isSaving && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center bg-transparent">
              <Lock className="h-4 w-4 text-[#A0A0A0]" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-medium leading-none text-white">Keep private</p>
              <p className="text-sm text-[#A0A0A0] mt-1.5">Only you have access</p>
            </div>
            {selected === "private" && <Check className="h-5 w-5 text-[#3b82f6]" />}
          </button>

          <div className="h-px w-full bg-[#3F3F3F]" />

          <button
            onClick={() => handleSelect("public")}
            disabled={isSaving}
            className={cn(
              "flex items-center gap-3 p-4 text-left transition-colors hover:bg-[#2E2E2E]",
              isSaving && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center bg-transparent">
              <Globe className="h-4 w-4 text-[#A0A0A0]" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-medium leading-none text-white">Create public link</p>
              <p className="text-sm text-[#A0A0A0] mt-1.5">Anyone with the link can view</p>
            </div>
            {selected === "public" && <Check className="h-5 w-5 text-[#3b82f6]" />}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between bg-[#1E1E1E] border border-[#3F3F3F] rounded-xl p-1.5 pl-4">
          <span className="text-[15px] text-[#A0A0A0] truncate pr-4 overflow-hidden select-all">
            {linkUrl}
          </span>
          <Button 
            onClick={handleCopy} 
            className="rounded-lg px-4 h-[38px] font-medium bg-[#E0E0E0] text-black hover:bg-white shrink-0"
          >
            {hasCopied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
