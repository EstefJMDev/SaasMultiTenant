// Mantenido por compatibilidad con barrels (pages/erp/index.ts).
// La página real ahora vive en ContractsRouteAdapter.tsx, que mapea la URL
// (/contracts, /contracts/:id/view, /contracts/:id/edit) al ContractsModule.
export { ContractsRouteHost as ErpContractsPage } from "./ContractsRouteAdapter";
export { ContractsRouteHost as default } from "./ContractsRouteAdapter";
