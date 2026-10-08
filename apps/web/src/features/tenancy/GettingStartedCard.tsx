export interface GettingStartedStep {
  readonly id: string;
  readonly label: string;
  readonly completed: boolean;
}

export interface GettingStartedCardProps {
  readonly title: string;
  readonly steps: readonly GettingStartedStep[];
}

export function GettingStartedCard({ steps, title }: GettingStartedCardProps) {
  return (
    <section className="rounded-cards border border-graphite-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-graphite-950">{title}</h2>
      <ol className="mt-4 grid gap-2">
        {steps.map((step) => (
          <li className="min-h-touch rounded-controls border border-graphite-200 px-3 py-2 text-sm text-graphite-900" data-completed={step.completed} key={step.id}>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
