/* Type-only view of the T04 core module inputs (see core.server.ts and change request T04-001). */
export type { AssetCreateInput, AssetHistoryEntry, AssetRetireInput, AssetUpdateInput } from "@agrorende/core/modules/assets/dto";
export type { PlotInput, PlotUpdateInput, SiteCreateInput, SiteUpdateInput } from "@agrorende/core/modules/sites/dto";
export type { SeasonCloseInput, SeasonCloseResult, SeasonCreateInput, SeasonOpenWork, SeasonUpdateInput } from "@agrorende/core/modules/seasons/dto";
export type { CustomerCreateInput, CustomerUpdateInput } from "@agrorende/core/modules/customers/dto";
export type { TemplateCreateInput, TemplatePublishInput, TemplateUpdateInput } from "@agrorende/core/modules/checklists/dto";
