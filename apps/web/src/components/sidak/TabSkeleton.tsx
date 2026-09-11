import { Skeleton } from "@/components/ui/skeleton";

export default function TabSkeleton() {
  return (
    <div
      className="flex min-h-[24rem] w-full items-center justify-center rounded-xl border border-border bg-muted/20"
      role="status"
      aria-label="Memuat panel"
    >
      <Skeleton className="size-10 rounded-full motion-reduce:animate-none" />
    </div>
  );
}
