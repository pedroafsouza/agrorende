import { useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Wizard, type WizardStep } from "../../components/Wizard";
import { loadDraft } from "../../lib/drafts";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { checkinRental, checkoutRental } from "../../sync/mutators/rentals";
import { Banner, EmptyState, ErrorState, OfflineBanner, Screen, Skeleton } from "../../ui";
import "./i18n";
import {
  AccessoriesStep,
  BriefingStep,
  ChargesStep,
  ChecklistStep,
  DamagesStep,
  IdentityStep,
  InspectionEnvProvider,
  LocaleStep,
  ReadingsStep,
  ReviewStep,
  SignaturesStep,
  TermsStep,
  WalkaroundStep,
} from "./InspectionSteps";
import {
  buildCheckinPayload,
  buildCheckoutPayload,
  canCheckIn,
  canCheckOut,
  draftIdFor,
  guardDraft,
  loadInspectionContext,
  newInspectionDraft,
  validateAccessories,
  validateBriefing,
  validateChecklist,
  validateDamages,
  validateIdentity,
  validateReadings,
  validateSignatures,
  validateTerms,
  validateWalkaround,
  type InspectionContext,
  type InspectionDraft,
  type InspectionKind,
} from "./logic";

export type InspectionWizardScreenProps = { readonly rentalId: string };

/** Hand-over wizard (§13.3, RN-04..RN-08): every step autosaves; the review step lists what still blocks the guard. */
export function CheckoutWizardScreen({ rentalId }: InspectionWizardScreenProps) {
  return <InspectionWizardScreen rentalId={rentalId} kind="CHECK_OUT" />;
}

/** Return wizard (§13.3, RN-09..RN-13): same evidence, comparison with the hand-over and the charges preview. */
export function CheckinWizardScreen({ rentalId }: InspectionWizardScreenProps) {
  return <InspectionWizardScreen rentalId={rentalId} kind="CHECK_IN" />;
}

function InspectionWizardScreen({ rentalId, kind }: { readonly rentalId: string; readonly kind: InspectionKind }) {
  const router = useRouter();
  const services = useServices();
  const [nowMs] = useState(() => services.now?.() ?? Date.now());
  const draftId = draftIdFor(kind, rentalId);
  const query = useLocalQuery(
    async (db) => {
      const ctx = await loadInspectionContext(db, rentalId, kind);
      const resumed = (await loadDraft(db, draftId)) !== undefined;
      return { ctx, resumed };
    },
    [rentalId, kind],
  );
  const testID = kind === "CHECK_OUT" ? "checkout-wizard" : "checkin-wizard";

  if (query.status === "loading") return <Screen testID={`${testID}-loading`}><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID={`${testID}-error`}><ErrorState onRetry={query.reload} /></Screen>;
  const { ctx, resumed } = query.data;
  if (ctx === undefined) {
    return (
      <Screen testID={`${testID}-not-found`}>
        <EmptyState icon={SearchX} titleKey="errors.RENTAL_NOT_FOUND.title" bodyKey="errors.RENTAL_NOT_FOUND.body" action={{ labelKey: "rentals.detail.backToList", onPress: () => router.replace("/rentals") }} />
      </Screen>
    );
  }
  const allowed = kind === "CHECK_OUT" ? canCheckOut(ctx.status) : canCheckIn(ctx.status);
  if (!allowed && !resumed) {
    const code = kind === "CHECK_OUT" ? "RENTAL_NOT_RESERVED" : "RENTAL_NOT_ACTIVE";
    return (
      <Screen testID={`${testID}-blocked`}>
        <EmptyState icon={SearchX} titleKey={`errors.${code}.title`} bodyKey={`errors.${code}.body`} action={{ labelKey: "rentals.detail.backToRental", onPress: () => router.replace(`/rentals/${rentalId}`) }} />
      </Screen>
    );
  }
  return <InspectionWizard ctx={ctx} nowMs={nowMs} resumed={resumed} draftId={draftId} testID={testID} />;
}

function InspectionWizard({ ctx, nowMs, resumed, draftId, testID }: { readonly ctx: InspectionContext; readonly nowMs: number; readonly resumed: boolean; readonly draftId: string; readonly testID: string }) {
  const router = useRouter();
  const services = useServices();
  const [showResumed, setShowResumed] = useState(resumed);
  const [initial] = useState(() =>
    newInspectionDraft(ctx, { inspectionId: services.newId?.() ?? `${nowMs}-i`, templateId: services.newId?.() ?? `${nowMs}-t` }),
  );
  const checkOut = ctx.kind === "CHECK_OUT";
  const steps = useMemo(() => buildSteps(ctx, nowMs), [ctx, nowMs]);

  return (
    <InspectionEnvProvider value={{ ctx, nowMs }}>
      <View style={styles.fill}>
        <View style={styles.banners}>
          <OfflineBanner />
          {showResumed ? <Banner testID={`${testID}-resumed`} tone="info" titleKey="errors.RENTAL_DRAFT_INTERRUPTED.title" bodyKey="errors.RENTAL_DRAFT_INTERRUPTED.body" onDismiss={() => setShowResumed(false)} /> : null}
        </View>
        <Wizard<InspectionDraft>
          testID={testID}
          draftId={draftId}
          kind={ctx.kind}
          refId={ctx.rentalId}
          initialPayload={initial}
          steps={steps}
          submitLabelKey={checkOut ? "rentals.wizard.submitCheckout" : "rentals.wizard.submitCheckin"}
          onCancel={() => router.back()}
          onSubmit={async (draft) => {
            if (checkOut) await checkoutRental(buildCheckoutPayload(draft));
            else await checkinRental(buildCheckinPayload(draft));
            router.replace(`/rentals/${ctx.rentalId}`);
          }}
        />
      </View>
    </InspectionEnvProvider>
  );
}

function buildSteps(ctx: InspectionContext, nowMs: number): readonly WizardStep<InspectionDraft>[] {
  const checkOut = ctx.kind === "CHECK_OUT";
  const steps: WizardStep<InspectionDraft>[] = [];
  if (checkOut) steps.push({ id: "locale", titleKey: "rentals.wizard.step.locale", render: () => <LocaleStep /> });
  steps.push(
    { id: "identity", titleKey: "rentals.wizard.step.identity", render: () => <IdentityStep />, validate: validateIdentity },
    { id: "walkaround", titleKey: "rentals.wizard.step.walkaround", render: () => <WalkaroundStep />, validate: validateWalkaround },
    { id: "readings", titleKey: "rentals.wizard.step.readings", render: () => <ReadingsStep />, validate: (draft) => validateReadings(draft, ctx, nowMs) },
    { id: "checklist", titleKey: "rentals.wizard.step.checklist", render: () => <ChecklistStep />, validate: validateChecklist },
    { id: "damages", titleKey: "rentals.wizard.step.damages", render: () => <DamagesStep />, validate: (draft) => validateDamages(draft, ctx) },
    { id: "accessories", titleKey: "rentals.wizard.step.accessories", render: () => <AccessoriesStep />, validate: validateAccessories },
  );
  if (checkOut) {
    steps.push(
      { id: "briefing", titleKey: "rentals.wizard.step.briefing", render: () => <BriefingStep />, validate: (draft) => validateBriefing(draft, ctx) },
      { id: "terms", titleKey: "rentals.wizard.step.terms", render: () => <TermsStep />, validate: validateTerms },
    );
  }
  steps.push({ id: "signatures", titleKey: "rentals.wizard.step.signatures", render: () => <SignaturesStep />, validate: validateSignatures });
  const guardKey = checkOut ? "errors.GUARD_CHECKOUT_INCOMPLETE.title" : "errors.GUARD_CHECKIN_INCOMPLETE.title";
  steps.push(
    checkOut
      ? { id: "review", titleKey: "rentals.wizard.step.review", render: () => <ReviewStep />, validate: (draft) => (guardDraft(draft, ctx) ? true : guardKey) }
      : { id: "charges", titleKey: "rentals.wizard.step.charges", render: () => <ChargesStep />, validate: (draft) => (guardDraft(draft, ctx) ? true : guardKey) },
  );

  return steps;
}

const styles = StyleSheet.create({
  banners: { gap: 8 },
  fill: { flex: 1 },
});
