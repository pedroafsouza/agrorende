import { Suspense } from "react";

import { PlatformOrgsPage } from "@/features/platform/PlatformOrgsPage";

export default function PlatformOrgsRoute() {
  return (
    <Suspense>
      <PlatformOrgsPage />
    </Suspense>
  );
}
