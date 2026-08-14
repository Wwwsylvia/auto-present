"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualDurationSeconds,
  activeRevision,
  type Project,
  type Slide,
} from "@/lib/domain";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function SlidePreview({ slide }: { slide: Slide }) {
  return (
    <div className={`slide-canvas layout-${slide.layout}`}>
      <div className="slide-topline"><span>IDEA2IMPACT</span><span>{slide.layout}</span></div>
      <div className="slide-content">
        <p className="slide-kicker">{slide.purpose}</p>
        <h2>{slide.title}</h2>
        {slide.layout === "architecture" ? (
          <div className="architecture-flow">
            {slide.bullets.map((bullet, index) => (
              <div className="architecture-node" key={bullet}>
                <span>{String(index + 1).padStart(2, "0")}</span>{bullet}
              </div>
            ))}
          </div>
        ) : (
          <ul>{slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        )}
      </div>
      <div className="slide-footer"><span>idea → impact</span><span>{formatTime(slide.durationSeconds)}</span></div>
    </div>
  );
}

export function ProjectWorkspace({
  foundryConfigured,
  initialProject,
}: {
  foundryConfigured: boolean;
  initialProject: Project;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const revision = activeRevision(project);
  const [selectedId, setSelectedId] = useState(revision?.slides[0]?.id ?? "");
  const [pending, setPending] = useState("");
  const [error, setError] = useState(project.lastError ?? "");
  const [changeSummary, setChangeSummary] = useState("");
  const selected = revision?.slides.find((slide) => slide.id === selectedId) ?? revision?.slides[0];
  const total = revision ? actualDurationSeconds(revision) : 0;
  const target = project.input.durationMinutes * 60;
  const durationStatus = Math.round(((total - target) / target) * 100);
  const activeRender = project.renderJobs.some((job) =>
    ["queued", "rendering", "retrying"].includes(job.status),
  );

  useEffect(() => {
    if (!activeRender) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/projects/${project.id}`, {
        cache: "no-store",
      });
      if (response.ok) setProject(await response.json());
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [activeRender, project.id]);

  async function invoke(endpoint: string) {
    setPending(endpoint);
    setError("");
    const response = await fetch(`/api/projects/${project.id}/${endpoint}`, { method: "POST" });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "The operation failed");
      return;
    }
    setProject(body);
    router.refresh();
  }

  async function render(kind: "preview" | "final") {
    setPending(`render-${kind}`);
    setError("");
    const response = await fetch(`/api/projects/${project.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "Rendering failed");
      return;
    }

    setProject(body);
    router.refresh();
  }

  async function retryRender(id: string) {
    setPending(`retry-${id}`);
    setError("");
    const response = await fetch(`/api/render-jobs/${id}/retry`, {
      method: "POST",
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "The render could not be retried");
      return;
    }
    setProject((current) => ({
      ...current,
      renderJobs: current.renderJobs.map((job) => (job.id === id ? body : job)),
    }));
  }

  async function saveSlide(formData: FormData) {
    if (!selected || !revision) return;
    setPending("save");
    setError("");
    const response = await fetch(`/api/projects/${project.id}/slides/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: revision.version,
        changes: {
          title: formData.get("title"),
          purpose: formData.get("purpose"),
          bullets: String(formData.get("bullets")).split("\n").map((item) => item.trim()).filter(Boolean),
          narration: formData.get("narration"),
          durationSeconds: Number(formData.get("durationSeconds")),
        },
      }),
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "Could not save the slide");
      return;
    }
    setProject(body);
    router.refresh();
  }

  async function revise(formData: FormData) {
    if (!revision) return;
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!instruction) return;
    setPending("revise");
    setError("");
    setChangeSummary("");
    const response = await fetch(`/api/projects/${project.id}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, expectedVersion: revision.version }),
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "AI revision failed");
      return;
    }
    setProject(body.project);
    setChangeSummary(body.summary);
    router.refresh();
  }

  async function uploadDemo(formData: FormData) {
    setPending("upload");
    setError("");
    const response = await fetch(`/api/projects/${project.id}/assets`, {
      method: "POST",
      body: formData,
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError(body.error ?? "Upload failed");
      return;
    }
    setProject(body);
    router.refresh();
  }

  if (!revision) {
    return (
      <section className="empty-workspace">
        <div className="empty-visual"><span>01</span><span>02</span><span>03</span></div>
        <div className="eyebrow">Stage 1 · Plan</div>
        <h1>Let&apos;s shape the story.</h1>
        <p>
          We&apos;ll turn your brief into a timed narrative and slide outline. You can edit
          every detail before moving forward.
        </p>
        <div className="brief-summary">
          <span>{project.input.durationMinutes} minutes</span>
          <span>{project.input.audience}</span>
          <span>{project.input.tone}</span>
          {project.input.githubUrl && <span>GitHub connected</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary wide" disabled={pending === "generate"} onClick={() => invoke("generate")}>
          {pending === "generate" ? "Analyzing and shaping..." : "Generate presentation plan"}
          <span>→</span>
        </button>
        {!foundryConfigured && (
          <p className="mode-note">Demo generation mode · Configure Foundry to enable AI generation</p>
        )}
      </section>
    );
  }

  const stageIndex = project.stage === "plan" ? 0 : project.stage === "create" ? 1 : 2;
  return (
    <>
      <nav className="stage-nav">
        {["Plan", "Create", "Produce"].map((name, index) => (
          <div className={index <= stageIndex ? "stage-step active" : "stage-step"} key={name}>
            <span>{index + 1}</span><strong>{name}</strong>
          </div>
        ))}
      </nav>
      <section className="workspace">
        <aside className="slide-list">
          <div className="panel-heading"><span>{revision.slides.length} slides</span><span>{formatTime(total)}</span></div>
          {revision.slides.map((slide, index) => (
            <button
              className={slide.id === selected?.id ? "thumbnail selected" : "thumbnail"}
              key={slide.id}
              onClick={() => setSelectedId(slide.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{slide.title}</strong><small>{slide.layout}</small></div>
              <time>{formatTime(slide.durationSeconds)}</time>
            </button>
          ))}
        </aside>
        <div className="preview-panel">
          <div className="preview-toolbar">
            <div><span className={`source source-${revision.source}`}>{revision.source}</span>Revision {revision.version}</div>
            <div className={Math.abs(durationStatus) > 10 ? "duration-warning" : "duration-ok"}>
              {formatTime(total)} / {formatTime(target)} target
            </div>
          </div>
          {selected && <SlidePreview slide={selected} />}
          <div className="narration-preview">
            <div className="eyebrow">Voiceover</div>
            <p>{selected?.narration}</p>
          </div>
          {project.stage === "produce" && (
            <div className="production-card">
              <div>
                <div className="eyebrow">Production</div>
                <h3>Ready for the screen</h3>
                <p>Preview renders are silent when Azure Speech is not configured. Final renders always require narrated audio.</p>
              </div>
              <div className="render-actions">
                <button className="secondary" disabled={Boolean(pending)} onClick={() => render("preview")}>
                  {pending === "render-preview" ? "Rendering preview..." : "Render preview"}
                </button>
                <button className="primary" disabled={Boolean(pending)} onClick={() => render("final")}>
                  {pending === "render-final" ? "Rendering final..." : "Render final MP4"}<span>→</span>
                </button>
              </div>
              {project.renderJobs.filter((job) => job.status !== "stale").map((job) => (
                <div className="render-result" key={job.id}>
                  <span>
                    {job.kind} · {job.status}
                    {["rendering", "retrying"].includes(job.status)
                      ? ` · ${job.progress}%`
                      : ""}
                  </span>
                  {job.status === "complete" && job.outputUrl && (
                    <a href={job.outputUrl}>Download MP4 ↓</a>
                  )}
                  {job.status === "failed" && (
                    <button
                      className="secondary"
                      disabled={pending === `retry-${job.id}`}
                      onClick={() => retryRender(job.id)}
                      type="button"
                    >
                      {pending === `retry-${job.id}` ? "Retrying..." : "Retry render"}
                    </button>
                  )}
                  {job.error && <small>{job.error}</small>}
                </div>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <aside className="properties-panel" key={`${revision.id}-${selected.id}`}>
            <form action={saveSlide} className="edit-slide-form">
              <div className="panel-heading"><strong>Edit slide</strong><span>{selected.layout}</span></div>
              <label>Title<input name="title" defaultValue={selected.title} required /></label>
              <label>Purpose<input name="purpose" defaultValue={selected.purpose} required /></label>
              <label>Key points<textarea name="bullets" rows={5} defaultValue={selected.bullets.join("\n")} /></label>
              <label>Narration<textarea name="narration" rows={8} defaultValue={selected.narration} required /></label>
              <label>Duration (seconds)<input min={3} max={180} name="durationSeconds" type="number" defaultValue={selected.durationSeconds} /></label>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="secondary" disabled={pending === "save"} type="submit">
                {pending === "save" ? "Saving..." : "Save as new revision"}
              </button>
            </form>
            {project.stage !== "produce" && (
              <button className="primary" disabled={Boolean(pending)} onClick={() => invoke("approve")} type="button">
                {project.stage === "plan" ? "Approve plan & create" : "Approve deck & produce"}
                <span>→</span>
              </button>
            )}
            <div className="copilot-divider"><span>or ask the copilot</span></div>
            <div className="copilot-box">
              <div><span className="copilot-spark">✦</span><strong>Contextual revision</strong></div>
              <p>Changes are validated and saved as a new revision.</p>
              <form action={revise}>
                <textarea name="instruction" rows={3} placeholder="Make the architecture slide more technical..." />
                <button className="secondary" disabled={pending === "revise"} type="submit">
                  {pending === "revise" ? "Applying..." : "Apply with Foundry"}
                </button>
              </form>
              {changeSummary && <p className="change-summary">{changeSummary}</p>}
            </div>
            <div className="copilot-divider"><span>optional demo</span></div>
            <form action={uploadDemo} className="asset-upload">
              <input accept="video/mp4,video/webm,video/quicktime" name="file" required type="file" />
              <button className="secondary" disabled={pending === "upload"} type="submit">
                {pending === "upload" ? "Uploading..." : project.assets[0] ? "Replace demo clip" : "Upload demo clip"}
              </button>
              {project.assets[0] && <small>{project.assets[0].name}</small>}
            </form>
          </aside>
        )}
      </section>
    </>
  );
}
