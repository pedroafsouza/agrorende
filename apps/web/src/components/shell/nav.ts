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

/** Sidebar categories, in display order. Labels live under `admin.navGroups`. */
export const NAV_GROUPS = ["overview", "service", "fleet", "customers", "finance", "admin"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  /** Message key under `admin.nav`. */
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly roles?: readonly ("ADMIN" | "MANAGER")[];
  readonly badge?: "attention";
  readonly children?: readonly NavItem[];
  /** Sidebar category of a top-level item. Items without one (account, notifications) are reached from the top bar. */
  readonly group?: NavGroup;
  /** P1 pages (A§14.1). They now sit in their category like any other page. */
  readonly p1?: boolean;
}

/** Every admin page in A§14.1. `nav.test` in the progress notes lists them all. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "ops", href: "/ops", icon: Activity, group: "overview" },
  { key: "attention", href: "/attention", icon: AlertCircle, badge: "attention", group: "overview" },
  { key: "reports", href: "/reports", icon: FileText, group: "overview" },
  { key: "analytics", href: "/analytics", icon: LineChart, p1: true, group: "overview" },
  { key: "workOrders", href: "/work-orders", icon: Wrench, group: "service" },
  { key: "maintenance", href: "/maintenance", icon: ClipboardList, p1: true, group: "service" },
  { key: "templates", href: "/templates", icon: ClipboardCheck, group: "service" },
  { key: "assets", href: "/assets", icon: Tractor, group: "fleet" },
  { key: "fuel", href: "/fuel", icon: Fuel, p1: true, group: "fleet" },
  { key: "parts", href: "/parts", icon: Package, p1: true, group: "fleet" },
  { key: "stock", href: "/stock", icon: Boxes, p1: true, group: "fleet" },
  { key: "customers", href: "/customers", icon: Building2, group: "customers" },
  { key: "rentals", href: "/rentals", icon: Truck, group: "customers" },
  { key: "sites", href: "/sites", icon: MapPinned, group: "customers" },
  { key: "costs", href: "/costs", icon: Receipt, group: "finance" },
  { key: "billing", href: "/billing", icon: BarChart3, p1: true, group: "finance" },
  { key: "team", href: "/team", icon: Users, group: "admin", children: [{ key: "devices", href: "/team/devices", icon: Smartphone, roles: ["ADMIN"] }] },
  { key: "seasons", href: "/seasons", icon: CalendarRange, roles: ["ADMIN"], group: "admin" },
  { key: "imports", href: "/imports", icon: Upload, roles: ["ADMIN"], group: "admin" },
  { key: "settings", href: "/settings", icon: Settings, roles: ["ADMIN"], group: "admin", children: [{ key: "subscription", href: "/settings/subscription", icon: CreditCard, roles: ["ADMIN"] }] },
  { key: "notifications", href: "/notifications", icon: Bell },
  { key: "account", href: "/account", icon: UserCircle },
];

/** Page reached when a FIELD user opens the admin; not in the sidebar. */
export const OFFICE_ROLE_REQUIRED_HREF = "/office-role-required";
export const ACCOUNT_ICON = KeyRound;

export function visibleNav(role: "ADMIN" | "MANAGER" | "FIELD" | null, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items
    .filter((item) => item.roles === undefined || (role !== null && role !== "FIELD" && item.roles.includes(role)))
    .map((item) => (item.children === undefined ? item : { ...item, children: visibleNav(role, item.children) }));
}

export interface NavSection {
  readonly group: NavGroup;
  readonly items: readonly NavItem[];
}

/** The sidebar: visible items by category, empty categories dropped. */
export function navSections(items: readonly NavItem[]): NavSection[] {
  return NAV_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((section) => section.items.length > 0);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function allNavHrefs(items: readonly NavItem[] = NAV_ITEMS): string[] {
  return items.flatMap((item) => [item.href, ...allNavHrefs(item.children ?? [])]);
}
