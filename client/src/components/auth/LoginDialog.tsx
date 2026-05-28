import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}

export function LoginDialog({ open, onOpenChange, message }: LoginDialogProps) {
  const handleRedirect = () => {
    const callbackUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://getmaterio.app/account?callback=${callbackUrl}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to Materio Chat</DialogTitle>
          <DialogDescription>
            {message || "Login to sync your chats and unlock higher message limits."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <Button onClick={handleRedirect} className="w-full h-12 text-base">
            Sign In with Materio
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">
            You will be securely redirected to Materio to authenticate.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
