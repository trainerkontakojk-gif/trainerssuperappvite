import { Link } from "@tanstack/react-router";
import { Tooltip } from "@base-ui/react/tooltip";
import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import type { NavItem, NavModel } from "./nav-config";

interface NavListProps {
  model: NavModel;
  pathname: string;
  /** Mencegah id ganda bila sidebar dan drawer dirender bersamaan. */
  idPrefix: string;
  /** Mode rail: label disembunyikan secara visual dan tooltip aktif. */
  collapsed?: boolean;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
  onNavigate?: () => void;
}

function domId(...parts: string[]) {
  return parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Daftar navigasi bersama untuk sidebar dan drawer ponsel. Isinya selalu dari
 * `buildNavModel`; komponen ini hanya merender.
 */
export function NavList({
  model,
  pathname,
  idPrefix,
  collapsed = false,
  hasTelefunAccess,
  openMaintenance,
  onNavigate,
}: NavListProps) {
  const handleClick = (item: NavItem) => (event: MouseEvent) => {
    if (item.id === "telefun" && !hasTelefunAccess) {
      event.preventDefault();
      openMaintenance();
      return;
    }
    onNavigate?.();
  };

  return (
    <Tooltip.Provider delay={150}>
      {model.groups.map((group) => (
        <div key={group.id} className="nav-group">
          {group.id !== "beranda" && (
            <p className="nav-group-label">{group.label}</p>
          )}
          {group.items.map((item) =>
            item.children && item.children.length > 0 && !collapsed ? (
              <NavGroupItem
                key={item.id}
                item={item}
                pathname={pathname}
                idPrefix={idPrefix}
                onNavigate={onNavigate}
              />
            ) : (
              <NavLinkItem
                key={item.id}
                item={item}
                idPrefix={idPrefix}
                collapsed={collapsed}
                onClick={handleClick(item)}
              />
            ),
          )}
        </div>
      ))}
    </Tooltip.Provider>
  );
}

function NavItemContent({
  item,
  descriptionId,
}: {
  item: NavItem;
  descriptionId: string;
}) {
  return (
    <>
      <item.icon className="nav-icon" aria-hidden="true" />
      <span className="nav-label">
        <span className="nav-name">{item.label}</span>
        {item.description && (
          // `aria-hidden` menjaga nama aksesibel tetap label saja; teks ini
          // tetap terbaca sebagai deskripsi lewat `aria-describedby`.
          <span className="nav-sub" id={descriptionId} aria-hidden="true">
            {item.description}
          </span>
        )}
      </span>
    </>
  );
}

function NavLinkItem({
  item,
  idPrefix,
  collapsed,
  onClick,
}: {
  item: NavItem;
  idPrefix: string;
  collapsed: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  const descriptionId = domId(idPrefix, "desc", item.id);
  const link = (
    <Link
      to={item.href as any}
      activeOptions={{ exact: item.id === "dashboard" }}
      className="nav-item"
      style={{ "--mc": item.moduleColor } as CSSProperties}
      aria-describedby={item.description ? descriptionId : undefined}
      onClick={onClick}
    />
  );

  return (
    <Tooltip.Root disabled={!collapsed}>
      <Tooltip.Trigger render={link}>
        <NavItemContent item={item} descriptionId={descriptionId} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={8} className="z-50">
          <Tooltip.Popup className="nav-tooltip" data-slot="rail-tooltip">
            {item.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function NavGroupItem({
  item,
  pathname,
  idPrefix,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  idPrefix: string;
  onNavigate?: () => void;
}) {
  const inSection =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const [open, setOpen] = useState(inSection);

  // Terbuka otomatis saat masuk ke salah satu halamannya.
  useEffect(() => {
    if (inSection) setOpen(true);
  }, [inSection]);

  const descriptionId = domId(idPrefix, "desc", item.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="nav-item"
        data-current={inSection || undefined}
        style={{ "--mc": item.moduleColor } as CSSProperties}
        aria-describedby={item.description ? descriptionId : undefined}
      >
        <NavItemContent item={item} descriptionId={descriptionId} />
        <ChevronDown className="nav-chevron" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="nav-sub-list">
        {item.children?.map((child) => (
          <Link
            key={child.to}
            to={child.to as any}
            activeOptions={{ exact: Boolean(child.exactMatch) }}
            className="nav-sub-item"
            onClick={() => onNavigate?.()}
          >
            {child.label}
          </Link>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
