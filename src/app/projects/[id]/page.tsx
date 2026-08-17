import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <main className="project-page">
      <header className="site-header project-header">
        {/* Full navigation lets the browser protect unsaved slide edits. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/">
          <span className="brand-mark">I2</span>Idea2Impact
        </a>
        <div className="project-meta">
          <span>{project.input.audience}</span>
          <span>{project.input.durationMinutes} min</span>
        </div>
      </header>
      <ProjectWorkspace initialProject={project} />
    </main>
  );
}
