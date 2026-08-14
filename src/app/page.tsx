import Link from "next/link";
import { NewProjectForm } from "@/components/new-project-form";
import { listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await listProjects();
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">I2</span>
          Idea2Impact
        </Link>
        <span className="hackathon-pill">Built with Microsoft Foundry</span>
      </header>
      <section className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow">Present less. Build more.</div>
          <h1>Turn your idea into a story people remember.</h1>
          <p>
            Shape the narrative, refine every slide, and produce a presentation video
            with voiceover and captions—without losing your final hackathon hours.
          </p>
          <div className="workflow-preview">
            <div><strong>01</strong><span>Plan the story</span></div>
            <div><strong>02</strong><span>Create the deck</span></div>
            <div><strong>03</strong><span>Produce the video</span></div>
          </div>
        </div>
        <NewProjectForm />
      </section>
      {projects.length > 0 && (
        <section className="recent">
          <div className="section-heading">
            <div><div className="eyebrow">Continue creating</div><h2>Recent projects</h2></div>
          </div>
          <div className="project-grid">
            {projects.map((project) => (
              <Link className="project-card" href={`/projects/${project.id}`} key={project.id}>
                <span className={`stage stage-${project.stage}`}>{project.stage}</span>
                <h3>{project.revisions.at(-1)?.title ?? project.input.idea.slice(0, 52)}</h3>
                <p>{project.input.durationMinutes} min · {project.input.audience}</p>
                <span className="open-project">Open project →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
