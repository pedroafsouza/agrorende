"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Apple, ArrowLeft, ArrowRight, Check, Play, SkipForward, Tractor, UserPlus, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { AnimationId } from "@agrorende/motion";

import { LoadingState } from "@/components/data/States";
import { EntityPicker } from "@/components/forms/EntityPicker";
import { prefersReducedMotion } from "@/components/feedback/RouteMotion";
import { Lottie } from "@/components/motion/Lottie";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { assetBody, assetFormValues } from "@/features/assets/AssetForm";
import { CATEGORIES, type AssetDTO } from "@/features/assets/types";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/features/shell/OfficeRoleRequired";
import { useMe } from "@/features/shell/useMe";
import { SharePanel } from "@/features/team/SharePanel";
import type { CreateUserResult } from "@/features/team/types";
import { EMPTY_NEW_WORK_ORDER, newWorkOrderBody, type WorkOrderListItem } from "@/features/work-orders/types";
import { ApiError, api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { GUIDE_STEPS, useGuideState, type GuideState, type GuideStep } from "./guideStorage";
import { GUIDE_TASKS, SUBSCRIPTION_QUERY_KEY, useGuideProgress, type GuideTask } from "./useGuideProgress";

const ANIMATION: Record<GuideStep, AnimationId> = {
  welcome: "welcome",
  machine: "first-machine",
  team: "invite-team",
  workOrder: "first-work-order",
  done: "success",
};

/** Which real-data task each step completes; welcome and done have none. */
const STEP_TASK: Partial<Record<GuideStep, GuideTask>> = { machine: "machine", team: "team", workOrder: "workOrder" };

type Update = (patch: Partial<GuideState>) => void;
export type GuideVariant = "page" | "modal";

/**
 * Called before anything inside the guide navigates away (a link, "Ir para a visão geral").
 * The modal closes itself here; the page has nothing to do.
 */
const GuideLeaveContext = createContext<() => void>(() => undefined);

const SLIDE_PX = 32;
const SLIDE_MS = 220;
const SPRING = "cubic-bezier(0.22, 1.2, 0.36, 1)";

/** Direction-aware slide between steps; reduced motion keeps only a short fade. */
function animateStep(element: HTMLElement | null, direction: number): void {
  if (element === null || typeof element.animate !== "function") return;
  const keyframes: Keyframe[] = prefersReducedMotion()
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: `translateX(${direction * SLIDE_PX}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ];
  element.animate(keyframes, { duration: SLIDE_MS, easing: SPRING });
}

/**
 * Guided first run for a new organisation's ADMIN (SIMPLER-TO-SELL §4 "Primeiros passos").
 * Five steps, each skippable; the place is remembered per organisation so the admin can leave
 * and resume, and completion is read from real data rather than from clicks. Normally shown in
 * `GuideModal`; the `/getting-started` page is the fallback without the modal.
 */
export function GuidePage() {
  return <GuideFlow variant="page" />;
}

export function GuideFlow({ variant, onLeave }: { readonly variant: GuideVariant; readonly onLeave?: () => void }) {
  const t = useTranslations("tenancy.guide");
  const me = useMe();
  const role = me.data?.user.role;
  const isAdmin = role === "ADMIN";
  const progress = useGuideProgress(isAdmin);
  const { state, ready, update } = useGuideState(me.data?.org?.id ?? me.data?.user.id);
  const panelRef = useRef<HTMLDivElement>(null);
  const index = GUIDE_STEPS.indexOf(state.step);
  const previousIndex = useRef(index);
  const leave = onLeave ?? (() => undefined);
  const modal = variant === "modal";
  const header = modal ? null : <PageHeader subtitle={t("subtitle")} title={t("title")} />;

  useLayoutEffect(() => {
    if (previousIndex.current === index) return;
    animateStep(panelRef.current, index > previousIndex.current ? 1 : -1);
    previousIndex.current = index;
  }, [index]);

  if (me.isLoading || (isAdmin && (progress.isLoading || !ready))) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <LoadingState rows={4} />
      </div>
    );
  }
  if (me.error !== null && me.data === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorAlert error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorAlert
          action={
            <Link className={buttonVariants({ variant: "secondary" })} href="/ops" onClick={leave}>
              {t("actions.toOverview")}
            </Link>
          }
          error={new ApiError({ code: "FORBIDDEN", status: 403 })}
        />
      </div>
    );
  }
  if (!progress.isReady) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorAlert error={progress.error} onRetry={progress.refetch} />
      </div>
    );
  }

  const go = (step: GuideStep) => {
    update({ step });
    if (modal) panelRef.current?.closest("[data-guide-scroll]")?.scrollTo?.({ top: 0 });
    else window.scrollTo({ top: 0 });
  };
  const next = () => go(GUIDE_STEPS[Math.min(index + 1, GUIDE_STEPS.length - 1)] ?? "done");
  const back = () => go(GUIDE_STEPS[Math.max(index - 1, 0)] ?? "welcome");

  return (
    <GuideLeaveContext.Provider value={leave}>
      <div className={modal ? "flex flex-col gap-4 sm:gap-6" : "flex flex-col gap-6"}>
        {header}
        <Stepper compact={modal} current={state.step} onSelect={go} tasks={progress.tasks} />
        <div className="overflow-x-clip">
          <section
            aria-labelledby="guide-step-title"
            className={
              modal
                ? "grid gap-2 sm:gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-8"
                : "grid gap-2 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 sm:gap-6 sm:p-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-8"
            }
            data-step={state.step}
            data-testid="guide-step-panel"
            ref={panelRef}
          >
            <Lottie className={modal ? "mx-auto w-full max-w-32 sm:max-w-48 md:max-w-none" : "mx-auto w-full max-w-40 sm:max-w-56 md:max-w-none"} id={ANIMATION[state.step]} key={state.step} playOnce />
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-[var(--ar-primary-text)]">{t("progress", { current: index + 1, total: GUIDE_STEPS.length })}</p>
              {state.step === "welcome" ? <WelcomeStep onNext={next} /> : null}
              {state.step === "machine" ? <MachineStep done={progress.tasks.machine} onBack={back} onNext={next} state={state} update={update} /> : null}
              {state.step === "team" ? <TeamStep done={progress.tasks.team} onBack={back} onNext={next} /> : null}
              {state.step === "workOrder" ? <WorkOrderStep done={progress.tasks.workOrder} onBack={back} onNext={next} state={state} update={update} /> : null}
              {state.step === "done" ? <DoneStep onBack={back} tasks={progress.tasks} update={update} /> : null}
            </div>
          </section>
        </div>
        {state.step === "done" || modal ? null : (
          <p className="text-center text-sm text-[var(--ar-text-muted)]">
            <Link className="inline-flex min-h-12 items-center gap-2 rounded-controls px-3 font-semibold text-[var(--ar-link)] underline underline-offset-4" href="/ops">
              {t("actions.later")}
            </Link>
          </p>
        )}
      </div>
    </GuideLeaveContext.Provider>
  );
}

/** `compact` (the modal) stacks each label under its dot and adds a thin progress bar. */
function Stepper({ current, onSelect, tasks, compact = false }: { readonly current: GuideStep; readonly onSelect: (step: GuideStep) => void; readonly tasks: Record<GuideTask, boolean>; readonly compact?: boolean }) {
  const t = useTranslations("tenancy.guide");
  const currentIndex = GUIDE_STEPS.indexOf(current);
  const percent = Math.round((currentIndex / (GUIDE_STEPS.length - 1)) * 100);
  return (
    <nav aria-label={t("stepsLabel")} className={compact ? "flex flex-col gap-2" : undefined}>
      <ol className="grid grid-cols-5 gap-1 sm:gap-2">
        {GUIDE_STEPS.map((step, index) => {
          const task = STEP_TASK[step];
          const completed = task === undefined ? index < currentIndex : tasks[task];
          const active = step === current;
          return (
            <li key={step}>
              <button
                aria-current={active ? "step" : undefined}
                className={`flex min-h-12 w-full flex-col items-center gap-1 rounded-controls px-1 py-2 text-center text-xs font-semibold ${compact ? "sm:text-sm" : "sm:flex-row sm:gap-2 sm:px-2 sm:text-left sm:text-sm"} ${active ? "bg-[var(--ar-primary-bg)] text-[var(--ar-primary-text)] ring-2 ring-[var(--ar-primary)] ring-inset" : "text-[var(--ar-text-muted)] hover:bg-[var(--ar-surface-muted)]"}`}
                onClick={() => onSelect(step)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${completed ? "bg-[var(--ar-primary)] text-[var(--ar-on-primary)]" : active ? "border-2 border-[var(--ar-primary)] text-[var(--ar-primary-text)]" : "border-2 border-[var(--ar-border-strong)] text-[var(--ar-text)]"}`}
                >
                  {completed ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="hidden leading-tight sm:inline">{t(`steps.${step}`)}</span>
                <span className="sr-only sm:hidden">{t(`steps.${step}`)}</span>
                {completed ? <span className="sr-only">{t("completed")}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {compact ? (
        <div aria-hidden="true" className="mx-[10%] h-1 overflow-hidden rounded-full bg-[var(--ar-surface-muted)]" data-testid="guide-progress-bar">
          <div className="h-full rounded-full bg-[var(--ar-primary)] transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </nav>
  );
}

function StepText({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold tracking-tight text-[var(--ar-text)]" id="guide-step-title">
        {title}
      </h2>
      <p className="text-[var(--ar-text-muted)]">{body}</p>
    </div>
  );
}

/**
 * One primary action per step. On phones the primary comes first; the quiet "Pular esta etapa"
 * (or "Continuar" once the task is already done) and "Voltar" follow it.
 */
function StepActions({ onBack, onSkip, skipDone = false, children }: { readonly onBack?: () => void; readonly onSkip?: () => void; readonly skipDone?: boolean; readonly children?: ReactNode }) {
  const t = useTranslations("tenancy.guide");
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--ar-border)] pt-4 sm:flex-row sm:flex-wrap sm:items-center" data-testid="guide-step-actions">
      <div className="flex flex-col gap-2 sm:order-last sm:ml-auto sm:flex-row">{children}</div>
      {onSkip === undefined ? null : (
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-controls px-3 text-sm font-semibold text-[var(--ar-link)] underline underline-offset-4 hover:bg-[var(--ar-surface-muted)] sm:order-2"
          data-testid="guide-skip"
          onClick={onSkip}
          type="button"
        >
          {skipDone ? <ArrowRight aria-hidden="true" className="size-4" /> : <SkipForward aria-hidden="true" className="size-4" />}
          {skipDone ? t("actions.next") : t("actions.skip")}
        </button>
      )}
      {onBack === undefined ? null : (
        <Button className="sm:order-1" icon={<ArrowLeft aria-hidden="true" className="size-4" />} onClick={onBack} variant="ghost">
          {t("actions.back")}
        </Button>
      )}
    </div>
  );
}

function DoneNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-controls border border-[var(--ar-success)] bg-[var(--ar-success-bg)] p-3 text-sm font-semibold text-[var(--ar-success-text)]" role="status">
      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function WelcomeStep({ onNext }: { readonly onNext: () => void }) {
  const t = useTranslations("tenancy.guide");
  const name = useMe().data?.user.name.split(" ")[0] ?? "";
  return (
    <>
      <StepText body={t("welcome.body")} title={t("welcome.title", { name })} />
      <StepActions>
        <Button icon={<ArrowRight aria-hidden="true" className="size-5" />} onClick={onNext} size="primary" variant="primary">
          {t("actions.start")}
        </Button>
      </StepActions>
    </>
  );
}

/** Field errors are shown next to the inputs; anything else goes through the recovery kit. */
function FormError({ error, fieldErrors }: { readonly error: unknown; readonly fieldErrors: Record<string, string> }) {
  if (error === null || error === undefined || Object.keys(fieldErrors).length > 0) return null;
  return <ErrorAlert compact error={error} />;
}

function MachineStep({ done, state, update, onNext, onBack }: { readonly done: boolean; readonly state: GuideState; readonly update: Update; readonly onNext: () => void; readonly onBack: () => void }) {
  const t = useTranslations("tenancy.guide");
  const common = useTranslations("common");
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("TRACTOR");
  const [save, saving] = useSave("assets", (body: Record<string, unknown>) => api<AssetDTO>("/assets", { method: "POST", body }), (asset) => {
    void client.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    update({ assetId: asset.id, assetName: asset.name, step: "team" });
  });
  const leave = useContext(GuideLeaveContext);
  const fe = useFieldErrors()(saving.error);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(assetBody({ ...assetFormValues(), name, category }, "create"));
  };
  return (
    <>
      <StepText body={t("machine.body")} title={t("machine.title")} />
      {state.assetName !== undefined ? <DoneNote>{t("machine.saved", { name: state.assetName })}</DoneNote> : done ? <DoneNote>{t("machine.already")}</DoneNote> : null}
      <form className="flex flex-col gap-4" id="guide-machine" noValidate onSubmit={submit}>
        <Field error={fe.name} hint={t("machine.namePlaceholder")} label={t("machine.name")} required>
          {(p) => <Input {...p} autoComplete="off" name="name" onChange={(e) => setName(e.target.value)} required value={name} />}
        </Field>
        <Field error={fe.category} label={t("machine.category")} required>
          {(p) => (
            <Select {...p} name="category" onChange={(e) => setCategory(e.target.value)} value={category}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {common(`category.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <FormError error={saving.error} fieldErrors={fe} />
        <Link className="inline-flex min-h-12 items-center gap-2 self-start font-semibold text-[var(--ar-link)] underline underline-offset-4" href={name.trim().length > 0 ? `/assets/new?name=${encodeURIComponent(name.trim())}` : "/assets/new"} onClick={leave}>
          <ArrowRight aria-hidden="true" className="size-4" />
          {t("machine.more")}
        </Link>
      </form>
      <StepActions onBack={onBack} onSkip={onNext} skipDone={done || state.assetId !== undefined}>
        <Button busy={saving.busy} disabled={name.trim().length === 0} form="guide-machine" icon={<Tractor aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("machine.submit")}
        </Button>
      </StepActions>
    </>
  );
}

function TeamStep({ done, onNext, onBack }: { readonly done: boolean; readonly onNext: () => void; readonly onBack: () => void }) {
  const t = useTranslations("tenancy.guide");
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CreateUserResult | null>(null);
  const [invite, inviting] = useSave("users", (body: Record<string, unknown>) => api<CreateUserResult>("/users", { method: "POST", body }), (created) => {
    void client.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    setResult(created);
  });
  const fe = useFieldErrors()(inviting.error);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void invite({ name: name.trim(), role: "FIELD", ...(phone.trim().length > 0 ? { phone: phone.trim() } : {}) });
  };
  if (result !== null) {
    return (
      <>
        <StepText body={t("team.sentBody")} title={t("team.sentTitle", { name: result.user.name })} />
        <SharePanel kind="invite" link={result.invite} name={result.user.name} phone={phone} />
        <StepActions onBack={() => setResult(null)}>
          <Button icon={<ArrowRight aria-hidden="true" className="size-5" />} onClick={onNext} size="primary" variant="primary">
            {t("actions.next")}
          </Button>
        </StepActions>
      </>
    );
  }
  return (
    <>
      <StepText body={t("team.body")} title={t("team.title")} />
      {done ? <DoneNote>{t("team.already")}</DoneNote> : null}
      <form className="flex flex-col gap-4" id="guide-team" noValidate onSubmit={submit}>
        <Field error={fe.name} label={t("team.name")} required>
          {(p) => <Input {...p} autoComplete="off" name="name" onChange={(e) => setName(e.target.value)} required value={name} />}
        </Field>
        <Field error={fe.phone} hint={t("team.phoneHint")} label={t("team.phone")}>
          {(p) => <Input {...p} autoComplete="off" inputMode="tel" name="phone" onChange={(e) => setPhone(e.target.value)} type="tel" value={phone} />}
        </Field>
        <FormError error={inviting.error} fieldErrors={fe} />
      </form>
      <StepActions onBack={onBack} onSkip={onNext} skipDone={done}>
        <Button busy={inviting.busy} disabled={name.trim().length === 0} form="guide-team" icon={<UserPlus aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("team.submit")}
        </Button>
      </StepActions>
    </>
  );
}

function WorkOrderStep({ done, state, update, onNext, onBack }: { readonly done: boolean; readonly state: GuideState; readonly update: Update; readonly onNext: () => void; readonly onBack: () => void }) {
  const t = useTranslations("tenancy.guide");
  const [title, setTitle] = useState(() => t("workOrder.defaultTitle"));
  const [assetId, setAssetId] = useState<string | null>(state.assetId ?? null);
  const [save, saving] = useSave("work-orders", (body: Record<string, unknown>) => api<WorkOrderListItem>("/work-orders", { method: "POST", body }), (workOrder) => {
    update({ workOrderId: workOrder.id, step: "done" });
  });
  const fe = useFieldErrors()(saving.error);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(newWorkOrderBody({ ...EMPTY_NEW_WORK_ORDER, title: title.trim(), assetId }));
  };
  return (
    <>
      <StepText body={t("workOrder.body")} title={t("workOrder.title")} />
      {done ? <DoneNote>{t("workOrder.already")}</DoneNote> : null}
      <form className="flex flex-col gap-4" id="guide-work-order" noValidate onSubmit={submit}>
        <Field error={fe.title} label={t("workOrder.fieldTitle")} required>
          {(p) => <Input {...p} autoComplete="off" name="title" onChange={(e) => setTitle(e.target.value)} required value={title} />}
        </Field>
        <Field error={fe.assetId} label={t("workOrder.machine")}>
          {(p) => <EntityPicker {...p} entity="assets" onChange={setAssetId} value={assetId} />}
        </Field>
        <FormError error={saving.error} fieldErrors={fe} />
      </form>
      <StepActions onBack={onBack} onSkip={onNext} skipDone={done}>
        <Button busy={saving.busy} disabled={title.trim().length === 0} form="guide-work-order" icon={<Wrench aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("workOrder.submit")}
        </Button>
      </StepActions>
    </>
  );
}

function DoneStep({ tasks, update, onBack }: { readonly tasks: Record<GuideTask, boolean>; readonly update: Update; readonly onBack: () => void }) {
  const t = useTranslations("tenancy.guide");
  const admin = useTranslations("admin");
  const router = useRouter();
  const leave = useContext(GuideLeaveContext);
  const finish = () => {
    update({ finished: true });
    leave();
    router.push("/ops");
  };
  return (
    <>
      <StepText body={t("done.body")} title={t("done.title")} />
      <ol className="flex list-decimal flex-col gap-2 pl-6 text-[var(--ar-text)]">
        <li>{t("done.next1")}</li>
        <li>{t("done.next2")}</li>
        <li>{t("done.next3")}</li>
      </ol>
      <div className="flex flex-col gap-2 rounded-controls border border-[var(--ar-border)] p-3">
        <p className="text-sm font-semibold">{t("done.appTitle")}</p>
        <div className="flex flex-wrap gap-2">
          <a className={buttonVariants({ variant: "secondary" })} href={APP_STORE_URL} rel="noreferrer" target="_blank">
            <Apple aria-hidden="true" className="size-5" />
            {admin("officeRole.appStore")}
          </a>
          <a className={buttonVariants({ variant: "secondary" })} href={PLAY_STORE_URL} rel="noreferrer" target="_blank">
            <Play aria-hidden="true" className="size-5" />
            {admin("officeRole.playStore")}
          </a>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t("done.summary")}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {GUIDE_TASKS.map((task) => (
            <li className="flex min-h-8 items-center gap-2 text-sm" data-completed={tasks[task]} key={task}>
              <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full ${tasks[task] ? "bg-[var(--ar-primary)] text-[var(--ar-on-primary)]" : "border-2 border-[var(--ar-border-strong)]"}`}>
                {tasks[task] ? <Check className="size-3.5" /> : null}
              </span>
              <span className={tasks[task] ? "text-[var(--ar-text-muted)]" : "font-semibold"}>{t(`tasks.${task}`)}</span>
              <span className="text-xs text-[var(--ar-text-muted)]">({tasks[task] ? t("completed") : t("pending")})</span>
            </li>
          ))}
        </ul>
      </div>
      <StepActions onBack={onBack}>
        <Button icon={<ArrowRight aria-hidden="true" className="size-5" />} onClick={finish} size="primary" variant="primary">
          {t("actions.toOverview")}
        </Button>
      </StepActions>
    </>
  );
}
