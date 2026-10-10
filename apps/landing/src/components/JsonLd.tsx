/** Serialises structured data safely for an inline <script> (no `</script>` break-out). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</gu, "\\u003c");
}

export function JsonLd({ data }: { readonly data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
