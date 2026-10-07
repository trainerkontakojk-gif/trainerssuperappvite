import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../../components/ui/dialog";

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** `Dialog` bersama yang ditampilkan sebagai panel kanan (layar penuh di ponsel). */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: SidePanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 right-0 left-auto flex h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-l border-border p-0 ring-0 sm:max-w-md data-open:zoom-in-100 data-closed:zoom-out-100">
        <div className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="font-display text-lg font-semibold tracking-tight">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="mt-1 truncate">
              {description}
            </DialogDescription>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-6 px-5 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
