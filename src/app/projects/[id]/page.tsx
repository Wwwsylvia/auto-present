import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { foundryConfigured } from "@/lib/config";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <main className="project-page">
      <header className="site-header project-header">
        <Link className="brand" href="/">
          <span className="brand-mark">I2</span>Idea2Impact
        </Link>
        <div className="project-meta">
          <span>{project.input.audience}</span>
          <span>{project.input.durationMinutes} min</span>
        </div>
      </header>
      <ProjectWorkspace
        foundryConfigured={foundryConfigured()}
        initialProject={project}
      />
    </main>
  );
}
