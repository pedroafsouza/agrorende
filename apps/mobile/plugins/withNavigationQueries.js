import { AndroidConfig, withAndroidManifest } from "expo/config-plugins";

const navigationSchemes = ["google.navigation", "geo", "waze"];

function buildQueryIntent(scheme) {
  return {
    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
    data: [{ $: { "android:scheme": scheme } }],
  };
}

export default function withNavigationQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const [queries] = manifest.queries;
    queries.intent = [...(queries.intent ?? []), ...navigationSchemes.map(buildQueryIntent)];
    AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    return mod;
  });
}
