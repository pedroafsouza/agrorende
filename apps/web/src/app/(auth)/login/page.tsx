import { Suspense } from "react";

import { LoginPage } from "@/features/shell/auth/LoginPage";

export default function LoginRoute() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
