import type { ReactNode } from "react";

import { PublicFrame } from "@/features/shell/auth/PublicFrame";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
