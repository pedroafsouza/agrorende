import type { ChecklistItem } from "@agrorende/contracts/checklist";
import type { DamageMatchStatus, DamageSeverity, DamageZone } from "@agrorende/contracts/enums";
import { formatMoney } from "@agrorende/i18n";
import { AlertTriangle, CheckCircle2, CircleDashed, Plus, ScanLine, Trash2, Wrench } from "lucide-react-native";
import { createContext, useContext, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { ChecklistRunner } from "../../components/ChecklistRunner";
import { MediaCapture, type MediaDraft } from "../../components/MediaCapture";
import { SignaturePad, type SignatureResult } from "../../components/SignaturePad";
import { useWizard } from "../../components/Wizard";
import { useLocale, useT } from "../../i18n/useT";
import { LocalError } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { discardCapture } from "../../media/capture";
import { Banner, BottomSheet, Button, Card, Chip, ListItem, NumberField, Segmented, Slider, StatusPill, Text, TextField } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { findAssetByCode } from "../assets/logic";
import { ScanView } from "../assets/ScanView";
import "./i18n";
import {
  DAMAGE_SEVERITIES,
  DAMAGE_ZONES,
  chargesPreview,
  hasTank,
  missingSteps,
  readingError,
  WALKAROUND_TAGS,
  type DamageDraft,
  type InspectionContext,
  type InspectionDraft,
} from "./logic";

// ───────── context ─────────

type StepEnv = { readonly ctx: InspectionContext; readonly nowMs: number };

const InspectionEnv = createContext<StepEnv | undefined>(undefined);

export const InspectionEnvProvider = InspectionEnv.Provider;

function useEnv(): StepEnv {
  const env = useContext(InspectionEnv);
  if (env === undefined) throw new Error("Inspection steps must render inside InspectionEnvProvider");
  return env;
}

function useDraft() {
  return useWizard<InspectionDraft>();
}

function parentOf(draft: InspectionDraft) {
  return { type: "INSPECTION" as const, id: draft.inspectionId };
}

/** Replaces the drafts of one group (tags or one damage) and discards captures the user removed. */
function useMediaGroup(belongs: (item: MediaDraft) => boolean) {
  const services = useServices();
  const { payload, update } = useDraft();
  const value = payload.media.filter(belongs);
  const onChange = (next: readonly MediaDraft[], decorate: (item: MediaDraft) => MediaDraft = (item) => item) => {
    const kept = new Set(next.map((item) => item.id));
    for (const removed of value) {
      if (!kept.has(removed.id) && services.db !== undefined && services.files !== undefined) discardCapture(services.db, services.files, removed.id).catch(() => undefined);
    }
    update((current) => ({ ...current, media: [...current.media.filter((item) => !belongs(item)), ...next.map(decorate)] }));
  };
  return { value, onChange };
}

function Done({ ok, labelKey, testID }: { readonly ok: boolean; readonly labelKey: string; readonly testID?: string }) {
  return <ListItem {...(testID === undefined ? {} : { testID })} icon={ok ? CheckCircle2 : CircleDashed} titleKey={labelKey} right={<StatusPill labelKey={ok ? "rentals.wizard.done" : "rentals.wizard.todo"} tone={ok ? "success" : "neutral"} />} />;
}

// ───────── steps ─────────

export function LocaleStep() {
  const { payload, update } = useDraft();
  return (
    <View style={styles.stack}>
      <Text i18nKey="rentals.wizard.locale.hint" tone="secondary" />
      <Segmented
        testID="insp-locale"
        large
        value={payload.documentLocale}
        onChange={(documentLocale) => update({ documentLocale })}
        options={[
          { value: "pt-BR", labelKey: "rentals.wizard.locale.ptBR" },
          { value: "en", labelKey: "rentals.wizard.locale.en" },
        ]}
      />
    </View>
  );
}

export function IdentityStep() {
  const { ctx } = useEnv();
  const services = useServices();
  const { payload, update } = useDraft();
  const [scanning, setScanning] = useState(false);
  const onCode = async (token: string) => {
    if (services.db === undefined) throw new LocalError("INTERNAL");
    const asset = await findAssetByCode(services.db, token);
    if (asset === undefined || asset.id !== ctx.assetId) throw new LocalError("RENTAL_ASSET_MISMATCH");
    setScanning(false);
    update({ identityConfirmed: true });
  };
  return (
    <View style={styles.stack}>
      <Card>
        <Text i18nKey="rentals.wizard.identity.expected" variant="label" />
        <Text testID="insp-identity-asset" variant="heading">{ctx.assetName.length > 0 ? ctx.assetName : "—"}</Text>
        {ctx.assetCode === null ? null : <Text tone="secondary">{ctx.assetCode}</Text>}
      </Card>
      {payload.identityConfirmed ? (
        <Banner testID="insp-identity-ok" tone="success" titleKey="rentals.wizard.identity.confirmed" action={{ labelKey: "rentals.wizard.identity.undo", onPress: () => update({ identityConfirmed: false }) }} />
      ) : scanning ? (
        <ScanView onCode={onCode} />
      ) : (
        <View style={styles.stack}>
          <Button testID="insp-identity-scan" icon={ScanLine} labelKey="rentals.wizard.identity.scan" onPress={() => setScanning(true)} />
          <Button testID="insp-identity-confirm" variant="secondary" icon={CheckCircle2} labelKey="rentals.wizard.identity.confirmVisual" onPress={() => update({ identityConfirmed: true })} />
        </View>
      )}
    </View>
  );
}

const WALK_SET = new Set<string>(WALKAROUND_TAGS);

export function WalkaroundStep() {
  const { ctx } = useEnv();
  const { payload } = useDraft();
  const group = useMediaGroup((item) => WALK_SET.has(item.tag));
  const tags = new Set(group.value.map((item) => item.tag));
  const before = ctx.checkOut?.media ?? [];
  return (
    <View style={styles.stack}>
      <Text i18nKey="rentals.wizard.walkaround.hint" tone="secondary" />
      <MediaCapture parent={parentOf(payload)} allowedTags={WALKAROUND_TAGS} value={group.value} onChange={(next) => group.onChange(next)} allowVideo={false} allowVoice={false} />
      {WALKAROUND_TAGS.map((tag) => {
        const old = before.find((item) => item.tag === tag);
        const now = group.value.find((item) => item.tag === tag);
        return (
          <View key={tag} testID={`insp-walk-${tag}`} style={styles.stack}>
            <Done ok={tags.has(tag)} labelKey={`media.tag.${tag}`} />
            {ctx.kind === "CHECK_IN" && old !== undefined ? (
              <View style={styles.compare} testID={`insp-compare-${tag}`}>
                <View style={styles.compareCell}>
                  <Text i18nKey="rentals.wizard.walkaround.before" variant="caption" tone="secondary" />
                  {old.localUri === null ? <Text i18nKey="rentals.wizard.walkaround.notOnDevice" variant="caption" tone="secondary" /> : <Image source={{ uri: old.localUri }} style={styles.photo} accessibilityIgnoresInvertColors />}
                </View>
                <View style={styles.compareCell}>
                  <Text i18nKey="rentals.wizard.walkaround.after" variant="caption" tone="secondary" />
                  {now === undefined ? <Text i18nKey="rentals.wizard.todo" variant="caption" tone="secondary" /> : <Image source={{ uri: now.thumbUri ?? now.localUri }} style={styles.photo} accessibilityIgnoresInvertColors />}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const READING_TAGS = new Set(["HOUR_METER", "FUEL_GAUGE"]);

export function ReadingsStep() {
  const { ctx, nowMs } = useEnv();
  const { payload, update } = useDraft();
  const group = useMediaGroup((item) => READING_TAGS.has(item.tag));
  const tank = hasTank(ctx);
  const error = readingError(payload, ctx, nowMs);
  const eighth = payload.fuelPercent === undefined ? undefined : Math.round((payload.fuelPercent / 100) * 8);
  const tags = new Set(group.value.map((item) => item.tag));
  return (
    <View style={styles.stack}>
      {ctx.baselineHourMeter === null ? null : <Text testID="insp-baseline" i18nKey="rentals.wizard.readings.baseline" values={{ value: ctx.baselineHourMeter }} tone="secondary" />}
      <NumberField testID="insp-hour-meter" labelKey="rentals.wizard.readings.hourMeter" unitKey="rentals.wizard.readings.hours" step={1} min={0} value={payload.hourMeter} onChange={(value) => update((current) => ({ ...current, ...(value === undefined ? { hourMeter: undefined } : { hourMeter: value }) }))} {...(error === undefined ? {} : { errorKey: error })} />
      {error === "errors.METER_READING_LOWER.title" ? <InlineError testID="insp-meter-lower" code="METER_READING_LOWER" /> : null}
      {error === "errors.METER_READING_JUMP.title" ? <InlineError testID="insp-meter-jump" code="METER_READING_JUMP" /> : null}
      <Chip testID="insp-meter-replaced" icon={Wrench} labelKey="rentals.wizard.readings.meterReplaced" selected={payload.meterReplaced} onPress={() => update({ meterReplaced: !payload.meterReplaced })} />
      {payload.meterReplaced ? <Text i18nKey="rentals.wizard.readings.meterReplacedHint" tone="secondary" /> : null}
      {tank ? <Slider testID="insp-fuel" labelKey="rentals.wizard.readings.fuel" value={eighth ?? 0} onChange={(i) => update({ fuelPercent: Math.round((i / 8) * 100) })} /> : null}
      <MediaCapture parent={parentOf(payload)} allowedTags={tank ? ["HOUR_METER", "FUEL_GAUGE"] : ["HOUR_METER"]} value={group.value} onChange={(next) => group.onChange(next)} allowVideo={false} allowVoice={false} />
      <Done ok={tags.has("HOUR_METER")} labelKey="media.tag.HOUR_METER" testID="insp-photo-HOUR_METER" />
      {tank ? <Done ok={tags.has("FUEL_GAUGE") && payload.fuelPercent !== undefined} labelKey="media.tag.FUEL_GAUGE" testID="insp-photo-FUEL_GAUGE" /> : null}
    </View>
  );
}

export function ChecklistStep() {
  const { nowMs } = useEnv();
  const { payload, update } = useDraft();
  const { ctx } = useEnv();
  const [photoFor, setPhotoFor] = useState<ChecklistItem | undefined>();
  if (payload.templateSnapshot.length === 0) return <Text testID="insp-checklist-empty" i18nKey="rentals.wizard.checklist.empty" tone="secondary" />;
  const onPhotos = (drafts: readonly MediaDraft[]) => {
    const item = photoFor;
    if (item === undefined) return;
    const known = new Set(payload.media.map((m) => m.id));
    const added = drafts.filter((d) => !known.has(d.id)).map((d) => ({ ...d, checklistItemKey: item.key }));
    if (added.length === 0) return;
    const at = new Date(nowMs).toISOString();
    update((current) => {
      const existing = current.responses.find((r) => r.key === item.key);
      const response = { key: item.key, value: existing?.value ?? null, ...(existing?.note === undefined ? {} : { note: existing.note }), mediaIds: [...new Set([...(existing?.mediaIds ?? []), ...added.map((d) => d.id)])], answeredAt: existing?.answeredAt ?? at };
      return { ...current, media: [...current.media, ...added], responses: [...current.responses.filter((r) => r.key !== item.key), response] };
    });
  };
  return (
    <View style={styles.stack}>
      <ChecklistRunner
        items={payload.templateSnapshot}
        responses={payload.responses}
        {...(ctx.checkOut === null ? {} : { previousResponses: ctx.checkOut.responses })}
        onChange={(responses) => update({ responses: [...responses] })}
        onCapturePhoto={(item) => setPhotoFor(item)}
        now={() => nowMs}
      />
      <BottomSheet testID="insp-checklist-photo" visible={photoFor !== undefined} onClose={() => setPhotoFor(undefined)} titleKey="rentals.wizard.checklist.photoTitle">
        {photoFor === undefined ? null : <MediaCapture parent={parentOf(payload)} allowedTags={["CHECKLIST_ITEM"]} checklistItemKey={photoFor.key} onChange={onPhotos} allowVideo={false} allowVoice={false} />}
      </BottomSheet>
    </View>
  );
}

function DamageCard({ damage, index }: { readonly damage: DamageDraft; readonly index: number }) {
  const { ctx } = useEnv();
  const { payload, update } = useDraft();
  const group = useMediaGroup((item) => item.tag === "DAMAGE" && item.damageId === damage.id);
  const patch = (next: Partial<DamageDraft>) => update((current) => ({ ...current, damages: current.damages.map((d) => (d.id === damage.id ? { ...d, ...next } : d)) }));
  const remove = () => {
    group.onChange([]);
    update((current) => ({ ...current, damages: current.damages.filter((d) => d.id !== damage.id) }));
  };
  const checkIn = ctx.kind === "CHECK_IN";
  return (
    <Card testID={`insp-damage-${index}`}>
      <View style={styles.row}>
        <Text i18nKey="rentals.wizard.damages.newTitle" values={{ n: index + 1 }} variant="label" />
        <Button testID={`insp-damage-${index}-remove`} compact variant="secondary" icon={Trash2} labelKey="rentals.wizard.damages.remove" onPress={remove} />
      </View>
      <Text i18nKey="rentals.wizard.damages.zone" variant="label" />
      <View style={styles.chips}>
        {DAMAGE_ZONES.map((zone: DamageZone) => (
          <Chip key={zone} testID={`insp-damage-${index}-zone-${zone}`} labelKey={`rentals.zone.${zone}`} selected={damage.zone === zone} onPress={() => patch({ zone })} />
        ))}
      </View>
      <Text i18nKey="rentals.wizard.damages.severity" variant="label" />
      <Segmented<DamageSeverity> testID={`insp-damage-${index}-severity`} value={damage.severity} onChange={(severity) => patch({ severity })} options={DAMAGE_SEVERITIES.map((value) => ({ value, labelKey: `rentals.severity.${value}` }))} />
      <TextField testID={`insp-damage-${index}-description`} labelKey="rentals.wizard.damages.description" value={damage.description ?? ""} onChangeText={(description) => patch({ description })} multiline />
      {checkIn ? (
        <>
          <Text i18nKey="rentals.wizard.damages.match" variant="label" />
          <Segmented<DamageMatchStatus>
            testID={`insp-damage-${index}-match`}
            value={damage.matchStatus}
            onChange={(matchStatus) => patch({ matchStatus })}
            options={[
              { value: "NEW", labelKey: "rentals.match.NEW" },
              { value: "UNCLEAR", labelKey: "rentals.match.UNCLEAR" },
            ]}
          />
          {damage.matchStatus === "UNCLEAR" ? <Banner tone="info" titleKey="errors.RENTAL_DAMAGE_MATCH_UNCLEAR.title" bodyKey="errors.RENTAL_DAMAGE_MATCH_UNCLEAR.body" /> : null}
          {damage.costUnknown === true ? null : (
            <NumberField
              testID={`insp-damage-${index}-cost`}
              labelKey="rentals.wizard.damages.cost"
              unitKey="rentals.wizard.damages.currency"
              min={0}
              step={100}
              value={damage.estimatedCostCents === undefined ? undefined : damage.estimatedCostCents / 100}
              onChange={(value) => update((current) => ({ ...current, damages: current.damages.map((d) => (d.id !== damage.id ? d : value === undefined ? { ...d, estimatedCostCents: undefined } : { ...d, estimatedCostCents: Math.round(value * 100) })) }))}
            />
          )}
          <Chip testID={`insp-damage-${index}-cost-unknown`} labelKey="rentals.wizard.damages.costUnknown" selected={damage.costUnknown === true} onPress={() => patch({ costUnknown: damage.costUnknown !== true })} />
          {damage.costUnknown === true ? <Banner tone="info" titleKey="errors.RENTAL_DAMAGE_COST_UNKNOWN.title" bodyKey="errors.RENTAL_DAMAGE_COST_UNKNOWN.body" /> : null}
        </>
      ) : null}
      <MediaCapture parent={parentOf(payload)} allowedTags={["DAMAGE"]} value={group.value} onChange={(next) => group.onChange(next, (item) => ({ ...item, tag: "DAMAGE", damageId: damage.id }))} allowVideo={false} allowVoice={false} />
      <Done ok={group.value.length > 0} labelKey="rentals.wizard.damages.photo" testID={`insp-damage-${index}-photo`} />
    </Card>
  );
}

export function DamagesStep() {
  const { ctx } = useEnv();
  const services = useServices();
  const { payload, update } = useDraft();
  const confirmed = (openId: string) => payload.damages.find((d) => d.matchedDamageId === openId);
  const answer = (openId: string, status: DamageMatchStatus) => {
    const open = ctx.openDamages.find((d) => d.id === openId);
    if (open === undefined) return;
    const existing = confirmed(openId);
    update((current) => ({
      ...current,
      damages: [
        ...current.damages.filter((d) => d.matchedDamageId !== openId),
        { id: existing?.id ?? services.newId?.() ?? `${Date.now()}`, zone: open.zone, severity: open.severity, ...(open.description === null ? {} : { description: open.description }), isPreExisting: true, matchStatus: status, matchedDamageId: openId },
      ],
    }));
  };
  const added = payload.damages.filter((d) => d.matchedDamageId === undefined);
  const addDamage = () =>
    update((current) => ({
      ...current,
      damages: [...current.damages, { id: services.newId?.() ?? `${Date.now()}`, zone: "OTHER", severity: "MINOR", isPreExisting: ctx.kind === "CHECK_OUT", matchStatus: "NEW" }],
    }));
  return (
    <View style={styles.stack}>
      {ctx.openDamages.length === 0 ? (
        <Text testID="insp-no-open-damages" i18nKey="rentals.wizard.damages.noneOpen" tone="secondary" />
      ) : (
        <>
          <Text i18nKey="rentals.wizard.damages.openTitle" variant="label" />
          {ctx.openDamages.map((open, i) => {
            const answerOf = confirmed(open.id)?.matchStatus;
            return (
              <Card key={open.id} testID={`insp-open-${i}`}>
                <ListItem icon={AlertTriangle} titleKey={`rentals.zone.${open.zone}`} subtitleKey={`rentals.severity.${open.severity}`} />
                {open.description === null ? null : <Text tone="secondary">{open.description}</Text>}
                <Segmented<DamageMatchStatus>
                  testID={`insp-open-${i}-answer`}
                  value={answerOf}
                  onChange={(status) => answer(open.id, status)}
                  options={ctx.kind === "CHECK_IN" ? [{ value: "MATCHED", labelKey: "rentals.match.MATCHED" }, { value: "UNCLEAR", labelKey: "rentals.match.UNCLEAR" }] : [{ value: "MATCHED", labelKey: "rentals.match.MATCHED" }]}
                />
              </Card>
            );
          })}
        </>
      )}
      {added.map((damage, index) => (
        <DamageCard key={damage.id} damage={damage} index={index} />
      ))}
      <Button testID="insp-damage-add" variant="secondary" icon={Plus} labelKey={ctx.kind === "CHECK_IN" ? "rentals.wizard.damages.addNew" : "rentals.wizard.damages.addExisting"} onPress={addDamage} />
    </View>
  );
}

export function AccessoriesStep() {
  const { ctx } = useEnv();
  const locale = useLocale();
  const { payload, update } = useDraft();
  const labels = new Map((ctx.template?.accessories ?? []).map((def) => [def.accessoryKey, def.label[locale === "en" ? "en" : "pt-BR"] ?? def.label[ctx.documentLocale] ?? def.accessoryKey]));
  if (payload.accessories.length === 0) return <Text testID="insp-accessories-empty" i18nKey="rentals.wizard.accessories.empty" tone="secondary" />;
  const patch = (key: string, next: { present?: number; missingReason?: string }) =>
    update((current) => ({ ...current, accessories: current.accessories.map((line) => (line.accessoryKey === key ? { ...line, ...next } : line)) }));
  return (
    <View style={styles.stack}>
      {payload.accessories.map((line, i) => {
        const missing = line.present < line.expected;
        return (
          <Card key={line.accessoryKey} testID={`insp-accessory-${i}`}>
            <Text variant="label">{labels.get(line.accessoryKey) ?? line.accessoryKey}</Text>
            <Text i18nKey="rentals.wizard.accessories.expected" values={{ count: line.expected }} tone="secondary" />
            <NumberField testID={`insp-accessory-${i}-present`} labelKey="rentals.wizard.accessories.present" min={0} value={line.present} onChange={(value) => patch(line.accessoryKey, { present: value ?? 0 })} />
            {missing ? (
              <>
                {ctx.kind === "CHECK_IN" ? <InlineError code="RENTAL_ACCESSORY_RETURN_MISSING" /> : <InlineError code="RENTAL_ACCESSORIES_MISSING" />}
                <TextField testID={`insp-accessory-${i}-note`} labelKey="rentals.wizard.accessories.note" value={line.missingReason ?? ""} onChangeText={(missingReason) => patch(line.accessoryKey, { missingReason })} />
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

export function BriefingStep() {
  const { ctx } = useEnv();
  const { payload, update } = useDraft();
  if (ctx.direction !== "OUTBOUND") return <Text testID="insp-briefing-skip" i18nKey="rentals.wizard.briefing.notRequired" tone="secondary" />;
  return (
    <View style={styles.stack}>
      <Text i18nKey="rentals.wizard.briefing.hint" tone="secondary" />
      <Chip testID="insp-briefing-given" icon={CheckCircle2} labelKey="rentals.wizard.briefing.given" selected={payload.safetyBriefingGiven} onPress={() => update({ safetyBriefingGiven: !payload.safetyBriefingGiven })} />
      <TextField testID="insp-operator-name" labelKey="rentals.wizard.briefing.operatorName" value={payload.operatorName} onChangeText={(operatorName) => update({ operatorName })} autoComplete="name" />
      <TextField testID="insp-operator-document" labelKey="rentals.wizard.briefing.operatorDocument" value={payload.operatorDocument} onChangeText={(operatorDocument) => update({ operatorDocument })} />
      {payload.safetyBriefingGiven ? null : <InlineError code="RENTAL_SAFETY_BRIEFING_MISSING" />}
    </View>
  );
}

export function TermsStep() {
  const { ctx } = useEnv();
  const { payload, update } = useDraft();
  const text = ctx.settings.termsText?.[payload.documentLocale] ?? ctx.settings.termsText?.["pt-BR"] ?? null;
  return (
    <View style={styles.stack}>
      {payload.termsVersion === undefined ? null : <Text testID="insp-terms-version" i18nKey="rentals.wizard.terms.version" values={{ version: payload.termsVersion }} variant="label" />}
      <Card>{text === null ? <Text i18nKey="rentals.wizard.terms.default" /> : <Text>{text}</Text>}</Card>
      <Chip testID="insp-terms-accept" icon={CheckCircle2} labelKey="rentals.wizard.terms.accept" selected={payload.termsAccepted} onPress={() => update({ termsAccepted: !payload.termsAccepted })} />
    </View>
  );
}

export function SignaturesStep() {
  const { ctx } = useEnv();
  const { payload, update } = useDraft();
  const [redoCustomer, setRedoCustomer] = useState(false);
  const [redoAgent, setRedoAgent] = useState(false);
  const checkIn = ctx.kind === "CHECK_IN";
  const customerDone = payload.customerSignature !== undefined || (payload.signatureStatus !== "SIGNED" && (payload.signatureReason?.length ?? 0) > 0);
  const onCustomer = (result: SignatureResult) => {
    setRedoCustomer(false);
    update((current) => {
      const { customerSignature: _c, signatureReason: _r, signerName: _n, signerDocument: _d, ...rest } = current;
      return {
        ...rest,
        signatureStatus: result.status,
        signerRole: "CUSTOMER",
        ...(result.signerName === undefined ? {} : { signerName: result.signerName }),
        ...(result.signerDocument === undefined ? {} : { signerDocument: result.signerDocument }),
        ...(result.reason === undefined ? {} : { signatureReason: result.reason }),
        ...(result.media === undefined ? {} : { customerSignature: { ...result.media, tag: "SIGNATURE_CUSTOMER" } }),
      };
    });
  };
  const onAgent = (result: SignatureResult) => {
    setRedoAgent(false);
    if (result.media !== undefined) update({ agentSignature: { ...result.media, tag: "SIGNATURE_AGENT" } });
  };
  return (
    <View style={styles.stack}>
      <Text i18nKey="rentals.wizard.signatures.customer" variant="heading" />
      {customerDone && !redoCustomer ? (
        <Banner
          testID="insp-customer-signed"
          tone={payload.signatureStatus === "SIGNED" ? "success" : "warning"}
          titleKey={`rentals.signature.${payload.signatureStatus}`}
          {...(payload.signerName === undefined ? {} : { bodyKey: "rentals.wizard.signatures.signer", bodyValues: { name: payload.signerName } })}
          action={{ labelKey: "rentals.wizard.signatures.redo", onPress: () => setRedoCustomer(true) }}
        />
      ) : (
        <SignaturePad documentLocale={payload.documentLocale} parent={parentOf(payload)} tag="SIGNATURE_CUSTOMER" signerRole="CUSTOMER" allowAbsent={checkIn} onSigned={onCustomer} />
      )}
      {payload.signatureStatus === "REFUSED" ? <Banner tone="warning" titleKey="errors.GUARD_SIGNATURE_REQUIRED.title" bodyKey="rentals.wizard.signatures.refusedNote" /> : null}
      <Text i18nKey="rentals.wizard.signatures.agent" variant="heading" />
      {payload.agentSignature !== undefined && !redoAgent ? (
        <Banner testID="insp-agent-signed" tone="success" titleKey="rentals.signature.SIGNED" action={{ labelKey: "rentals.wizard.signatures.redo", onPress: () => setRedoAgent(true) }} />
      ) : (
        <SignaturePad documentLocale={payload.documentLocale} parent={parentOf(payload)} tag="SIGNATURE_AGENT" signerRole="AGENT" onSigned={onAgent} />
      )}
    </View>
  );
}

function MissingList({ testID }: { readonly testID: string }) {
  const { ctx, nowMs } = useEnv();
  const { payload, goTo } = useDraft();
  const missing = missingSteps(payload, ctx, nowMs);
  if (missing.length === 0) return <Banner testID={`${testID}-ready`} tone="success" titleKey="rentals.wizard.review.ready" />;
  return (
    <View style={styles.stack} testID={`${testID}-missing`}>
      <Banner tone="warning" titleKey={ctx.kind === "CHECK_OUT" ? "errors.GUARD_CHECKOUT_INCOMPLETE.title" : "errors.GUARD_CHECKIN_INCOMPLETE.title"} bodyKey={ctx.kind === "CHECK_OUT" ? "errors.GUARD_CHECKOUT_INCOMPLETE.body" : "errors.GUARD_CHECKIN_INCOMPLETE.body"} />
      {missing.map((item) => (
        <ListItem
          key={item.step}
          testID={`${testID}-fix-${item.step}`}
          icon={AlertTriangle}
          danger
          titleKey={`rentals.wizard.step.${item.step}`}
          subtitleKey={item.reason}
          right={<Text i18nKey="rentals.wizard.review.fix" variant="label" tone="primary" />}
          onPress={() => goTo(item.step)}
        />
      ))}
    </View>
  );
}

export function ReviewStep() {
  const { ctx } = useEnv();
  const { payload } = useDraft();
  const t = useT();
  const photos = payload.media.length + (payload.customerSignature === undefined ? 0 : 1) + (payload.agentSignature === undefined ? 0 : 1);
  return (
    <View style={styles.stack}>
      <MissingList testID="insp-review" />
      <Card>
        <ListItem titleKey="rentals.wizard.review.machine" subtitle={ctx.assetName} />
        <ListItem titleKey="rentals.wizard.review.customer" subtitle={ctx.customerName} />
        <ListItem titleKey="rentals.wizard.review.hourMeter" subtitle={payload.hourMeter === undefined ? "—" : String(payload.hourMeter)} />
        {hasTank(ctx) ? <ListItem titleKey="rentals.wizard.review.fuel" subtitle={payload.fuelPercent === undefined ? "—" : `${payload.fuelPercent}%`} /> : null}
        <ListItem titleKey="rentals.wizard.review.media" subtitle={t("rentals.wizard.review.mediaCount", { count: photos })} />
        <ListItem titleKey="rentals.wizard.review.locale" subtitleKey={payload.documentLocale === "en" ? "rentals.wizard.locale.en" : "rentals.wizard.locale.ptBR"} />
      </Card>
    </View>
  );
}

export function ChargesStep() {
  const { ctx, nowMs } = useEnv();
  const { payload } = useDraft();
  const locale = useLocale();
  const summary = chargesPreview(ctx, payload, nowMs);
  const money = (cents: number) => formatMoney(cents, ctx.settings.currency, locale);
  const late = nowMs > Date.parse(ctx.charges.plannedEnd);
  const early = nowMs < Date.parse(ctx.charges.plannedEnd) - 86_400_000;
  return (
    <View style={styles.stack}>
      <MissingList testID="insp-charges" />
      {late ? <Banner tone="warning" titleKey="errors.RENTAL_OVERDUE.title" bodyKey="rentals.wizard.charges.lateNote" /> : null}
      {early ? <Banner tone="info" titleKey="errors.RENTAL_EARLY_RETURN.title" bodyKey="errors.RENTAL_EARLY_RETURN.body" /> : null}
      <Text i18nKey="rentals.wizard.charges.preview" variant="heading" />
      <Card testID="insp-charges-lines">
        {summary.lines.map((line, i) => (
          <ListItem key={`${line.type}-${i}`} testID={`insp-charge-${i}`} titleKey={`rentals.charge.${line.type}`} subtitle={line.description} right={<Text testID={`insp-charge-${i}-amount`} variant="label">{money(line.amountCents)}</Text>} />
        ))}
      </Card>
      <View style={styles.row}>
        <Text i18nKey="rentals.wizard.charges.total" variant="heading" />
        <Text testID="insp-charges-total" variant="heading">{money(summary.totalCents)}</Text>
      </View>
      <View style={styles.row}>
        <Text i18nKey="rentals.wizard.charges.deposit" />
        <Text testID="insp-charges-deposit">{money(ctx.charges.depositCents)}</Text>
      </View>
      <View style={styles.row}>
        <Text i18nKey="rentals.wizard.charges.balance" variant="heading" />
        <Text testID="insp-charges-balance" variant="heading">{money(summary.balanceDueCents)}</Text>
      </View>
      <Text i18nKey="rentals.wizard.charges.note" tone="secondary" variant="caption" />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  compare: { flexDirection: "row", gap: 8 },
  compareCell: { flex: 1, gap: 4 },
  photo: { aspectRatio: 4 / 3, borderRadius: 8, width: "100%" },
  row: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  stack: { gap: 12 },
});
