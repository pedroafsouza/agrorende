/* Type-only view of the T04 core module inputs (see core.server.ts and change request T04-001). */
export type { AssetCreateInput, AssetHistoryEntry, AssetRetireInput, AssetUpdateInput } from "../../../../packages/core/src/modules/assets/dto";
export type { PlotInput, PlotUpdateInput, SiteCreateInput, SiteUpdateInput } from "../../../../packages/core/src/modules/sites/dto";
export type { SeasonCloseInput, SeasonCloseResult, SeasonCreateInput, SeasonOpenWork, SeasonUpdateInput } from "../../../../packages/core/src/modules/seasons/dto";
export type { CustomerCreateInput, CustomerUpdateInput } from "../../../../packages/core/src/modules/customers/dto";
export type { TemplateCreateInput, TemplatePublishInput, TemplateUpdateInput } from "../../../../packages/core/src/modules/checklists/dto";
