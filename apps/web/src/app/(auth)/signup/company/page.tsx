import { Suspense } from "react";

import { CompanyFormPage } from "@/features/signup/CompanyFormPage";
import { legalUrls } from "@/features/signup/legal";
import { SignupIntl } from "@/features/signup/SignupIntl";
import { getRequestLocale } from "@/lib/i18n.server";

export default async function SignupCompanyRoute() {
  const urls = legalUrls(process.env.SITE_URL, await getRequestLocale());
  return (
    <SignupIntl>
      <Suspense>
        <CompanyFormPage dpaUrl={urls.dpaUrl} privacyUrl={urls.privacyUrl} termsUrl={urls.termsUrl} />
      </Suspense>
    </SignupIntl>
  );
}
