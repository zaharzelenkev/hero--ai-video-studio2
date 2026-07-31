import DirectorWorkspace from "@/components/director/DirectorWorkspace"; export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <DirectorWorkspace projectId={id} />; }
