/** Pure low-stock rule (ERP-05), used by the worker `stock.lowScan`; it has no database imports. */

export interface LowStockEntry {
  readonly partId: string;
  readonly partName: string;
  readonly sku: string;
  readonly stockLocationId: string;
  readonly locationName: string;
  readonly quantity: number;
  readonly minStock: number;
}

/** Levels at or below the part's `minStock` (ERP-05). Archived and inactive parts are skipped. */
export function lowStockEntries(
  parts: readonly { _id: string; name: string; sku: string; minStock?: number | null; isActive?: boolean; archivedAt?: Date | null }[],
  locations: readonly { _id: string; name: string }[],
  levels: readonly { partId: string; stockLocationId: string; quantity: number }[],
): LowStockEntry[] {
  const partById = new Map(parts.filter((part) => part.isActive !== false && (part.archivedAt ?? null) === null).map((part) => [part._id, part]));
  const locationById = new Map(locations.map((location) => [location._id, location]));
  const entries: LowStockEntry[] = [];
  for (const level of levels) {
    const part = partById.get(level.partId);
    const location = locationById.get(level.stockLocationId);
    const minStock = part?.minStock ?? null;
    if (part === undefined || location === undefined || minStock === null || level.quantity > minStock) continue;
    entries.push({ partId: part._id, partName: part.name, sku: part.sku, stockLocationId: location._id, locationName: location.name, quantity: level.quantity, minStock });
  }
  return entries;
}
