import type { ReactNode } from "react";

import "@/components/shell/theme.css";

import { Providers } from "@/components/shell/Providers";
import { PlatformFrame } from "@/features/platform/PlatformFrame";
import { PlatformIntl } from "@/features/platform/PlatformIntl";

export const dynamic = "force-dynamic";

/** Staff console: separate `ar_platform` session, so no tenant re-auth dialog (TEN-06). */
export default function PlatformLayout({ children }: { readonly children: ReactNode }) {
  return (
    <PlatformIntl>
      <Providers reauth={false}>
        <PlatformFrame>{children}</PlatformFrame>
      </Providers>
    </PlatformIntl>
  );
}
