import type { NavBadge } from "./nav-badges";

/** Visible number (aria-hidden) plus the sentence for screen readers. */
export function NavBadgeMark({
  badge,
  className = "nav-badge",
}: {
  badge: NavBadge | undefined;
  className?: string;
}) {
  if (!badge) return null;
  return (
    <>
      <span className={className} aria-hidden="true">
        {badge.count > 99 ? "99+" : badge.count}
      </span>
      <span className="sr-only">, {badge.label}</span>
    </>
  );
}
