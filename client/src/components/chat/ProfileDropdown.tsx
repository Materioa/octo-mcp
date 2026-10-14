import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { User } from "@/stores/auth";
import { Globe, User as UserIcon, Cog, LogOut, ChevronRight } from "lucide-react";

interface ProfileDropdownProps {
  user: User;
  onLogout: () => void;
  onSettings: (tab?: string, view?: "list" | "detail") => void;
  isCollapsed?: boolean;
}

export function ProfileDropdown({ user, onLogout, onSettings, isCollapsed }: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  
  const tier = user.hasAdminPrivileges ? "Super" : user.isPlusUser ? "Pro" : "Go";

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const closeDropdown = () => {
    setClosing(true);
    setOpen(false);
    setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
  };

  const toggleDropdown = () => {
    if (open) closeDropdown();
    else {
      setMounted(true);
      setOpen(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (portalRef.current && portalRef.current.contains(event.target as Node)) {
          return;
        }
        if (open) closeDropdown();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const dropdownContent = (
    <>
      <div className="sm:hidden w-full flex justify-center pt-3 pb-1">
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="flex items-center gap-3 p-4 sm:p-3">
        {user.profilePicture ? (
          <img src={user.profilePicture} alt="Avatar" className="h-10 w-10 sm:h-10 sm:w-10 rounded-full shrink-0 object-cover border border-border/50" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {user.displayName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || "U"}
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-[16px] sm:text-[15px] font-semibold">{user.displayName || user.username}</span>
          <span className="text-[14px] sm:text-[13px] text-muted-foreground">{tier}</span>
        </div>
      </div>
      
      <div className="h-px bg-border/50 mx-4 sm:mx-3" />
      
      <div className="p-2 sm:p-2 space-y-1 sm:space-y-[2px]">
        <button 
          className="flex w-full items-center gap-3 rounded-xl sm:rounded-lg px-4 sm:px-3 py-3 sm:py-2 text-[15px] sm:text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
          onClick={() => { closeDropdown(); setTimeout(() => onSettings("personalization", "detail"), 200); }}
        >
          <Globe className="w-[20px] h-[20px] sm:w-[18px] sm:h-[18px]" />
          Personalization
        </button>
        <button 
          className="flex w-full items-center gap-3 rounded-xl sm:rounded-lg px-4 sm:px-3 py-3 sm:py-2 text-[15px] sm:text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
          onClick={() => { closeDropdown(); window.open("https://accounts.getmaterio.app/account/profile", "_blank"); }}
        >
          <UserIcon className="w-[20px] h-[20px] sm:w-[18px] sm:h-[18px]" />
          Profile
        </button>
        <button 
          className="flex w-full items-center gap-3 rounded-xl sm:rounded-lg px-4 sm:px-3 py-3 sm:py-2 text-[15px] sm:text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
          onClick={() => { closeDropdown(); setTimeout(() => onSettings(undefined, "list"), 200); }}
        >
          <Cog className="w-[20px] h-[20px] sm:w-[18px] sm:h-[18px]" />
          Settings
        </button>
      </div>

      <div className="h-px bg-border/50 mx-4 sm:mx-3" />
      
      <div className="p-2 sm:p-2 space-y-1 sm:space-y-[2px]">
        <button 
          className="flex w-full items-center gap-3 rounded-xl sm:rounded-lg px-4 sm:px-3 py-3 sm:py-2 text-[15px] sm:text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent text-red-500"
          onClick={() => { closeDropdown(); setTimeout(onLogout, 200); }}
        >
          <LogOut className="w-[20px] h-[20px] sm:w-[18px] sm:h-[18px]" />
          Log out
          <ChevronRight className="w-[16px] h-[16px] sm:w-[14px] sm:h-[14px] ml-auto text-muted-foreground" />
        </button>
      </div>
    </>
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors",
          isCollapsed ? "justify-center h-11 p-1" : "p-2"
        )}
        onClick={toggleDropdown}
        title={isCollapsed ? user.displayName || user.username : undefined}
      >
        {user.profilePicture ? (
          <img src={user.profilePicture} alt="Avatar" className={cn("rounded-full shrink-0 object-cover border border-border/50", isCollapsed ? "h-6 w-6" : "h-8 w-8")} />
        ) : (
          <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", isCollapsed ? "h-6 w-6 text-xs font-semibold" : "h-8 w-8")}>
            {user.displayName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase()}
          </div>
        )}
        {!isCollapsed && (
          <div className="flex flex-1 flex-col items-start overflow-hidden text-left">
            <span className="text-[13px] font-semibold text-foreground truncate w-full">
              {user.displayName || user.username}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {tier}
            </span>
          </div>
        )}
      </button>

      {mounted && (
        isMobile ? createPortal(
          <div ref={portalRef} className="portal-root relative z-[9999]">
            {/* Mobile Backdrop */}
            <div 
              className={cn(
                "fixed inset-0 bg-black/60 transition-opacity duration-200",
                closing ? "opacity-0" : "opacity-100"
              )}
              onClick={closeDropdown}
            />
            
            <div className={cn(
              "fixed inset-x-0 bottom-0 mb-0 w-full rounded-t-3xl border border-border bg-popover text-popover-foreground shadow-xl pb-8",
              "duration-200 fill-mode-forwards",
              closing 
                ? "animate-out fade-out slide-out-to-bottom-full" 
                : "animate-in fade-in slide-in-from-bottom-full"
            )}>
              {dropdownContent}
            </div>
          </div>,
          document.body
        ) : (
          <div className={cn(
            "absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl z-[60]",
            "duration-200 fill-mode-forwards",
            closing 
              ? "animate-out fade-out slide-out-to-bottom-2" 
              : "animate-in fade-in slide-in-from-bottom-2"
          )}>
            {dropdownContent}
          </div>
        )
      )}
    </div>
  );
}
