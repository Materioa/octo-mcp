import { XIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentPreviewProps {
  document: { url: string; format: string; title: string };
  onClose: () => void;
}

export function DocumentPreview({ document, onClose }: DocumentPreviewProps) {
  const isDocx = document.format === "docx";
  const previewUrl = isDocx 
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(document.url)}` 
    : document.url;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:relative md:w-2/5 md:border-l md:border-border shadow-2xl md:shadow-none transition-all duration-300 animate-in slide-in-from-bottom md:slide-in-from-right">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 bg-muted/30">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="truncate font-semibold text-sm">{document.title}</span>
          <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {document.format}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Open in new tab"
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
          <a
            href={document.url}
            download
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </a>
          <div className="mx-1 h-4 w-px bg-border"></div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close preview"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden bg-muted/10 relative">
        <iframe
          src={previewUrl}
          className="absolute inset-0 h-full w-full border-none"
          title={document.title}
        />
      </div>
    </div>
  );
}
