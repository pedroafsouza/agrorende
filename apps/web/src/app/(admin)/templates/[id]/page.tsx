import { TemplateEditorPage } from "@/features/templates/TemplateEditorPage";

export default async function TemplatePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditorPage id={id} />;
}
