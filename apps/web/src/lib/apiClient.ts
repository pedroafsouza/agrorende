import type { AgrorendeApiClient, AuthLoginResponse, ListResponse } from "@agrorende/api-client";
import type { AssetDTO } from "@agrorende/contracts/dto";

export type WebApiClient = AgrorendeApiClient;
export type WebAuthLoginResponse = AuthLoginResponse;
export type AssetListResponse = ListResponse<AssetDTO>;
