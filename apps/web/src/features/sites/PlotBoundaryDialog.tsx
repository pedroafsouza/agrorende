"use client";

import type { PlotDTO } from "@agrorende/contracts/dto";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/FormDialog";
import { ConflictActions } from "@/components/recovery/ConflictActions";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useSave } from "@/lib/useSave";

import { BoundaryDrawMap } from "./BoundaryDrawMap";
import { formatRing, parseRing, ringAreaHa, type Position } from "./plotGeometry";

export interface PlotBoundaryDialogProps {
  readonly plot: PlotDTO;
  readonly center?: { readonly lng: number; readonly lat: number } | null;
  readonly onClose: () => void;
  readonly onConflictReload: () => Promise<PlotDTO | undefined>;
}

function initialRing(plot: PlotDTO): Position[] | null {
  const outer = plot.boundary?.coordinates[0];
  return outer === undefined ? null : outer.map(([lng, lat]) => [lng, lat] as Position);
}

/**
 * Draw or type a plot boundary (ERP-01 P1). The server recomputes area and centroid from the
 * polygon, so the request clears them; the preview uses the same projection as the server.
 */
export function PlotBoundaryDialog({
  plot,
  center,
  onClose,
  onConflictReload,
}: PlotBoundaryDialogProps) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const locale = useLocale();
  const [ring, setRing] = useState<Position[] | null>(() => initialRing(plot));
  const [text, setText] = useState(() => {
    const start = initialRing(plot);
    return start === null ? "" : formatRing(start);
  });
  const [problem, setProblem] = useState<"format" | "range" | "tooFew" | null>(null);
  const [save, state] = useSave(
    "plots",
    (body: Record<string, unknown>, version: string) =>
      api<PlotDTO>(`/plots/${plot.id}`, { method: "PATCH", body, version }),
    (saved) => {
      toast.success(
        saved.areaHa === null || saved.areaHa === undefined
          ? common("toast.saved")
          : t("plots.boundary.saved", { area: formatNumber(saved.areaHa, locale, 2) }),
      );
      onClose();
    },
  );

  const fromMap = (next: Position[] | null) => {
    setRing(next);
    setText(next === null ? "" : formatRing(next));
    setProblem(null);
  };

  const fromText = (value: string) => {
    setText(value);
    if (value.trim() === "") {
      setRing(null);
      setProblem(null);
      return;
    }
    const parsed = parseRing(value);
    if (parsed.ok) {
      setRing(parsed.ring);
      setProblem(null);
    } else {
      setProblem(parsed.problem);
    }
  };

  const body = (current: Position[]) => ({
    boundary: { type: "Polygon", coordinates: [current] },
    areaHa: null,
    centroidLat: null,
    centroidLng: null,
  });

  const submit = (version: string) => {
    if (ring === null || problem !== null) {
      setProblem(problem ?? "tooFew");
      return;
    }
    void save(body(ring), version);
  };

  const area = ring === null || problem !== null ? null : ringAreaHa(ring);
  const hadBoundary = plot.boundary !== null && plot.boundary !== undefined;

  return (
    <FormDialog
      busy={state.busy}
      dirty
      error={state.error}
      errorAction={
        state.conflict ? (
          <ConflictActions
            onKeepMine={() =>
              void onConflictReload().then((fresh) =>
                fresh === undefined ? undefined : submit(fresh.syncVersion),
              )
            }
            onUseTheirs={onClose}
          />
        ) : undefined
      }
      formId="plot-boundary-form"
      onClose={onClose}
      onSubmit={() => submit(plot.syncVersion)}
      open
      size="lg"
      submitLabel={t("plots.boundary.save")}
      title={t("plots.boundary.title", { name: plot.name })}
    >
      <div className="flex flex-col gap-4">
        <BoundaryDrawMap center={center} onChange={fromMap} ring={ring} />
        <p aria-live="polite" className="font-semibold" data-testid="boundary-area">
          {area === null
            ? t("plots.boundary.noArea")
            : t("plots.boundary.area", { area: formatNumber(area, locale, 2) })}
        </p>
        <Field
          error={problem === null ? undefined : t(`plots.boundary.problem.${problem}`)}
          hint={t("plots.boundary.coordinatesHint")}
          label={t("plots.boundary.coordinates")}
        >
          {(p) => (
            <Textarea
              {...p}
              className="font-mono text-sm"
              name="boundary"
              onChange={(event) => fromText(event.target.value)}
              rows={6}
              spellCheck={false}
              value={text}
            />
          )}
        </Field>
        {hadBoundary ? (
          <div>
            <Button
              busy={state.busy}
              icon={<Trash2 aria-hidden="true" className="size-4" />}
              onClick={() => void save({ boundary: null }, plot.syncVersion)}
              variant="danger"
            >
              {t("plots.boundary.remove")}
            </Button>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
