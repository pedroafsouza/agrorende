import { Suspense } from "react";

import { ChangePasswordPage } from "@/features/shell/auth/ChangePasswordPage";

export default function ChangePasswordRoute() {
  return (
    <Suspense>
      <ChangePasswordPage />
    </Suspense>
  );
}
