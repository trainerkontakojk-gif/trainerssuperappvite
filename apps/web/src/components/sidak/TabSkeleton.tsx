import { Loader2 } from "lucide-react";

export default function TabSkeleton() {
  return (
    <div className="flex h-[400px] w-full animate-pulse items-center justify-center rounded-2xl bg-muted/20">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}
