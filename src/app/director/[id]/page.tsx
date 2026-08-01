import DirectorWorkspace from "@/components/director/DirectorWorkspace";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode = sp?.mode === "pro" || sp?.mode === "basic" ? sp.mode : undefined;
  return <DirectorWorkspace projectId={id} initialMode={mode} />;
}
