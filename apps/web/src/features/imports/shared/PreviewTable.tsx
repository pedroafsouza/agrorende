import type { ImportPreview } from "./parser";

export interface ImportPreviewTableLabels {
  readonly row: string;
  readonly errors: string;
}

export function ImportPreviewTable({ labels, preview }: { readonly labels: ImportPreviewTableLabels; readonly preview: ImportPreview }) {
  return (
    <div className="overflow-auto rounded-cards border border-graphite-200 bg-white">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-graphite-200 px-3 py-2 text-graphite-700">{labels.row}</th>
            {preview.headers.map((header) => (
              <th className="border-b border-graphite-200 px-3 py-2 text-graphite-700" key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="border-b border-graphite-100 px-3 py-2 font-mono text-graphite-700">{row.rowNumber}</td>
              {row.values.map((value, index) => (
                <td className="border-b border-graphite-100 px-3 py-2 text-graphite-900" key={`${row.rowNumber}-${index}`}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-sm font-semibold text-graphite-700">
        {labels.errors}
        <span className="ml-2 font-mono">{preview.errors.length}</span>
      </p>
    </div>
  );
}
