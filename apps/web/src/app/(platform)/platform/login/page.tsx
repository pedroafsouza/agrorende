import { Suspense } from "react";

import { PlatformLoginPage } from "@/features/platform/PlatformLoginPage";
import { serverConfig } from "@/server/config";

export default function PlatformLoginRoute() {
  return (
    <div className="flex flex-1 items-start justify-center sm:items-center">
      <Suspense>
        <PlatformLoginPage showDevLogin={serverConfig.appEnv === "local"} />
      </Suspense>
    </div>
  );
}
