import { Suspense } from "react";

import { SignupIntl } from "@/features/signup/SignupIntl";
import { SignupStartPage } from "@/features/signup/SignupStartPage";

export default function SignupRoute() {
  return (
    <SignupIntl>
      <Suspense>
        <SignupStartPage />
      </Suspense>
    </SignupIntl>
  );
}
