import { notImplemented } from "../lib/notImplemented";

export type AssetPickerValue = { readonly assetId?: string; readonly unregisteredAssetDescription?: string };
export type AssetPickerProps = { readonly value?: AssetPickerValue; readonly onChange: (value: AssetPickerValue) => void };
export function AssetPicker(_props: AssetPickerProps): never { return notImplemented("components.AssetPicker"); }
