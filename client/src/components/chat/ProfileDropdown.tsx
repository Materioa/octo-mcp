import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { User } from "@/stores/auth";

interface ProfileDropdownProps {
  user: User;
  onLogout: () => void;
  onSettings: (tab?: string) => void;
  isCollapsed?: boolean;
}

export function ProfileDropdown({ user, onLogout, onSettings, isCollapsed }: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const tier = user.hasAdminPrivileges ? "Super" : user.isPlusUser ? "Pro" : "Go";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors",
          isCollapsed ? "justify-center h-11 p-1" : "p-2"
        )}
        onClick={() => setOpen(!open)}
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

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 z-[60]">
          <div className="flex items-center gap-3 p-3">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Avatar" className="h-10 w-10 rounded-full shrink-0 object-cover border border-border/50" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {user.displayName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">{user.displayName || user.username}</span>
              <span className="text-[13px] text-muted-foreground">{tier}</span>
            </div>
          </div>
          
          <div className="h-px bg-border/50 mx-3" />
          
          <div className="p-2 space-y-[2px]">
            <button 
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
              onClick={() => { setOpen(false); onSettings("personalization"); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              Personalization
            </button>
            <button 
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
              onClick={() => { setOpen(false); window.open("https://getmaterio.app/account/profile", "_blank"); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Profile
            </button>
            <button 
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-white/5"
              onClick={() => { setOpen(false); onSettings("ai"); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Settings
            </button>
          </div>

          <div className="h-px bg-border/50 mx-3" />
          
          <div className="p-2 space-y-[2px]">
            <button 
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-popover-foreground transition-colors hover:bg-accent"
              onClick={() => { setOpen(false); onLogout(); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              Log out
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted-foreground"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
