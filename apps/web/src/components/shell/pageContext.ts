import { NAV_ITEMS, type NavItem } from "./nav";

/** Pages that each admin section points to in its "About this page" panel. Keys are `admin.nav` keys. */
export const RELATED_PAGES: Readonly<Record<string, readonly string[]>> = {
  ops: ["attention", "workOrders", "reports", "rentals"],
  attention: ["ops", "workOrders", "rentals", "notifications"],
  reports: ["workOrders", "assets", "templates"],
  workOrders: ["reports", "assets", "team", "costs"],
  rentals: ["customers", "assets", "billing"],
  assets: ["maintenance", "workOrders", "sites", "imports"],
  sites: ["assets", "customers"],
  customers: ["rentals", "sites", "billing"],
  team: ["devices", "workOrders"],
  devices: ["team"],
  templates: ["reports", "workOrders", "maintenance"],
  seasons: ["costs", "analytics"],
  costs: ["workOrders", "fuel", "parts", "seasons"],
  imports: ["assets", "customers", "team"],
  settings: ["subscription", "team", "templates"],
  subscription: ["settings"],
  notifications: ["attention", "account"],
  account: ["notifications"],
  analytics: ["costs", "workOrders", "assets"],
  parts: ["stock", "workOrders"],
  stock: ["parts", "costs"],
  maintenance: ["assets", "workOrders", "templates"],
  fuel: ["assets", "costs"],
  billing: ["rentals", "customers"],
};

export type PageLeaf = "detail" | "new";

export interface Crumb {
  /** `admin.nav` key. */
  readonly key: string;
  readonly href: string;
}

export interface PageContextInfo {
  /** `admin.nav` key of the deepest section that matches the path. */
  readonly key: string;
  /** Sections from the top level down to `key`. */
  readonly trail: readonly Crumb[];
  /** Set when the path goes past the section, for example `/work-orders/new` or `/assets/<id>`. */
  readonly leaf: PageLeaf | null;
}

function flatten(items: readonly NavItem[], parents: readonly Crumb[] = []): { readonly item: NavItem; readonly trail: readonly Crumb[] }[] {
  return items.flatMap((item) => {
    const trail = [...parents, { key: item.key, href: item.href }];
    return [{ item, trail }, ...flatten(item.children ?? [], trail)];
  });
}

const ENTRIES = flatten(NAV_ITEMS).sort((a, b) => b.item.href.length - a.item.href.length);

/** Looks up a sidebar entry, including children, by its `admin.nav` key. */
export function findNavItem(key: string, items: readonly NavItem[] = NAV_ITEMS): NavItem | undefined {
  return flatten(items).find(({ item }) => item.key === key)?.item;
}

/** Finds the admin section for a path, or `null` for pages outside the sidebar. */
export function resolvePageContext(pathname: string): PageContextInfo | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const match = ENTRIES.find(({ item }) => path === item.href || path.startsWith(`${item.href}/`));
  if (match === undefined) {
    return null;
  }
  const rest = path.slice(match.item.href.length).split("/").filter((part) => part.length > 0);
  const leaf: PageLeaf | null = rest.length === 0 ? null : rest[0] === "new" ? "new" : "detail";
  return { key: match.item.key, trail: match.trail, leaf };
}
