import "server-only";

/* Typed adapter to the T07 core module, reached through the `@agrorende/core/modules/*` export. */
export * as workOrdersCore from "@agrorende/core/modules/workOrders/service";
export * as workOrdersQueries from "@agrorende/core/modules/workOrders/queries";
export * as workOrdersSuggest from "@agrorende/core/modules/workOrders/suggest";
export * as workOrdersReport from "@agrorende/core/modules/workOrders/report";
export * as workOrdersField from "@agrorende/core/modules/workOrders/field";
