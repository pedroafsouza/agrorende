import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Fuel,
  KeyRound,
  LineChart,
  type LucideIcon,
  MapPinned,
  Package,
  Receipt,
  Settings,
  Smartphone,
  Tractor,
  Truck,
  Upload,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";

export interface NavItem {
  /** Message key under `admin.nav`. */
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly roles?: readonly ("ADMIN" | "MANAGER")[];
  readonly badge?: "attention";
  readonly children?: readonly NavItem[];
  /** P1 pages stay reachable but are grouped under "More" (A§14.1). */
  readonly p1?: boolean;
}

/** Every admin page in A§14.1. `nav.test` in the progress notes lists them all. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "ops", href: "/ops", icon: Activity },
  { key: "attention", href: "/attention", icon: AlertCircle, badge: "attention" },
  { key: "reports", href: "/reports", icon: FileText },
  { key: "workOrders", href: "/work-orders", icon: Wrench },
  { key: "rentals", href: "/rentals", icon: Truck },
  { key: "assets", href: "/assets", icon: Tractor },
  { key: "sites", href: "/sites", icon: MapPinned },
  { key: "customers", href: "/customers", icon: Building2 },
  { key: "team", href: "/team", icon: Users, children: [{ key: "devices", href: "/team/devices", icon: Smartphone, roles: ["ADMIN"] }] },
  { key: "templates", href: "/templates", icon: ClipboardCheck },
  { key: "seasons", href: "/seasons", icon: CalendarRange, roles: ["ADMIN"] },
  { key: "costs", href: "/costs", icon: Receipt },
  { key: "imports", href: "/imports", icon: Upload, roles: ["ADMIN"] },
  { key: "settings", href: "/settings", icon: Settings, roles: ["ADMIN"], children: [{ key: "subscription", href: "/settings/subscription", icon: CreditCard, roles: ["ADMIN"] }] },
  { key: "notifications", href: "/notifications", icon: Bell },
  { key: "account", href: "/account", icon: UserCircle },
  { key: "analytics", href: "/analytics", icon: LineChart, p1: true },
  { key: "parts", href: "/parts", icon: Package, p1: true },
  { key: "stock", href: "/stock", icon: Boxes, p1: true },
  { key: "maintenance", href: "/maintenance", icon: ClipboardList, p1: true },
  { key: "fuel", href: "/fuel", icon: Fuel, p1: true },
  { key: "billing", href: "/billing", icon: BarChart3, p1: true },
];

/** Page reached when a FIELD user opens the admin; not in the sidebar. */
export const OFFICE_ROLE_REQUIRED_HREF = "/office-role-required";
export const ACCOUNT_ICON = KeyRound;

export function visibleNav(role: "ADMIN" | "MANAGER" | "FIELD" | null, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items
    .filter((item) => item.roles === undefined || (role !== null && role !== "FIELD" && item.roles.includes(role)))
    .map((item) => (item.children === undefined ? item : { ...item, children: visibleNav(role, item.children) }));
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function allNavHrefs(items: readonly NavItem[] = NAV_ITEMS): string[] {
  return items.flatMap((item) => [item.href, ...allNavHrefs(item.children ?? [])]);
}
