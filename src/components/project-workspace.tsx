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

function StageNav({ stage }: { stage: "brief" | "review" | "produce" }) {
  const activeIndex = stage === "brief" ? 0 : stage === "review" ? 1 : 2;
  return (
    <nav className="stage-nav" aria-label="Presentation workflow">
      {["Brief", "Review deck", "Produce video"].map((name, index) => (
        <div className={index <= activeIndex ? "stage-step active" : "stage-step"} key={name}>
          <span>{index + 1}</span><strong>{name}</strong>
        </div>
      ))}
    </nav>
  );
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
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<{ area: string; message: string } | null>(
    project.lastError ? { area: "workspace", message: project.lastError } : null,
  );
  const [notice, setNotice] = useState("");
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

  async function generate() {
    setPending("generate");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/generate`, { method: "POST" });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError({ area: "generate", message: body.error ?? "Could not generate the presentation" });
      return;
    }
    setProject(body);
    setSelectedId(body.revisions.at(-1)?.slides[0]?.id ?? "");
    router.refresh();
  }

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function reportError(area: string, message: string) {
    setPending("");
    setError({ area, message });
    setNotice("");
  }

  async function approveDeck() {
    if (dirty && !window.confirm("You have unsaved slide changes. Discard them and continue?")) return;
    setDirty(false);
    setPending("approve");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/approve`, { method: "POST" });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      reportError("approve", body.error ?? "Could not approve the deck");
      return;
    }
    setProject(body);
    setNotice("The complete deck and narration are approved.");
    router.refresh();
  }

  async function render(kind: "preview" | "final") {
    setPending(`render-${kind}`);
    setError(null);
    setNotice(`${kind === "preview" ? "Preview" : "Final video"} queued.`);
    const response = await fetch(`/api/projects/${project.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      reportError("render", body.error ?? "Rendering failed");
      const latest = await fetch(`/api/projects/${project.id}`).then((result) => result.json());
      if (latest.id) setProject(latest);
      return;
    }

    setProject(body);
    setNotice(`${kind === "preview" ? "Preview" : "Final video"} queued for background rendering.`);
    router.refresh();
  }

  async function retryRender(id: string) {
    setPending(`retry-${id}`);
    setError(null);
    const response = await fetch(`/api/render-jobs/${id}/retry`, {
      method: "POST",
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      setError({ area: "render", message: body.error ?? "The render could not be retried" });
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
    setError(null);
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
      reportError("save", body.error ?? "Could not save the slide");
      return;
    }
    setProject(body);
    setDirty(false);
    setNotice("Slide changes saved.");
    router.refresh();
  }

  async function revise(formData: FormData) {
    if (!revision) return;
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!instruction) return;
    if (dirty && !window.confirm("Discard unsaved slide changes and apply an AI revision?")) return;
    setPending("revise");
    setError(null);
    setChangeSummary("");
    const response = await fetch(`/api/projects/${project.id}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, expectedVersion: revision.version }),
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      reportError("revise", body.error ?? "AI revision failed");
      return;
    }
    setProject(body.project);
    setDirty(false);
    setChangeSummary(body.summary);
    setNotice("AI revision applied.");
    router.refresh();
  }

  async function uploadDemo(formData: FormData) {
    setPending("upload");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/assets`, {
      method: "POST",
      body: formData,
    });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      reportError("upload", body.error ?? "Upload failed");
      return;
    }
    setProject(body);
    setNotice("Demo clip uploaded.");
    router.refresh();
  }

  async function removeDemo() {
    setPending("remove");
    setError(null);
    const response = await fetch(`/api/projects/${project.id}/assets`, { method: "DELETE" });
    const body = await response.json();
    setPending("");
    if (!response.ok) {
      reportError("upload", body.error ?? "Could not remove the demo clip");
      return;
    }
    setProject(body);
    setNotice("Demo clip removed.");
    router.refresh();
  }

  function selectSlide(id: string) {
    if (id === selected?.id) return;
    if (dirty && !window.confirm("Discard unsaved changes to this slide?")) return;
    setDirty(false);
    setError(null);
    setNotice("");
    setSelectedId(id);
  }

  if (!revision) {
    return (
      <>
        <StageNav stage="brief" />
        <section className="generation-workspace" aria-live="polite">
          <div className="eyebrow">Building your presentation</div>
          <h1>Turning your idea into a clear story.</h1>
          {pending === "generate" && <div className="progress-track"><span /></div>}
          <p>
            We&apos;re analyzing the brief, planning the narrative, and creating slides with narration.
          </p>
          {!pending && !error && (
            <button className="primary wide" onClick={() => void generate()} type="button">
              Continue generation <span>→</span>
            </button>
          )}
          {error?.area === "generate" && (
            <>
              <p className="error" role="alert">{error.message}</p>
              <button className="primary wide" onClick={() => void generate()} type="button">
                Retry generation <span>→</span>
              </button>
            </>
          )}
          {!foundryConfigured && (
            <p className="mode-note">Demo mode uses sample-generated content so you can explore the complete workflow.</p>
          )}
        </section>
      </>
    );
  }

  if (project.stage === "produce") {
    const demo = project.assets.find((asset) => asset.kind === "demo-video");
    const activeJobs = project.renderJobs.filter((job) =>
      ["queued", "rendering", "retrying"].includes(job.status),
    );
    return (
      <>
        <StageNav stage="produce" />
        <main className="production-workspace">
          <header className="production-heading">
            <div><div className="eyebrow">Produce video</div><h1>Bring the approved story to life.</h1></div>
            <div className="approved-badge">✓ Deck approved</div>
          </header>
          {notice && <p className="success" role="status">{notice}</p>}
          <div className="production-grid">
            <section className="production-panel">
              <div className="panel-number">01</div>
              <h2>Add your demo clip</h2>
              <p>
                Optional. Your clip plays as the visual immediately before the closing slide while
                that segment&apos;s narration continues. Short clips loop to fill the segment.
              </p>
              <p className="field-help">MP4, WebM, or QuickTime · maximum 100 MB</p>
              {demo ? (
                <div className="asset-summary">
                  <div><strong>{demo.name}</strong><small>{(demo.size / 1024 / 1024).toFixed(1)} MB</small></div>
                  <button className="text-button" disabled={Boolean(pending)} onClick={() => void removeDemo()} type="button">
                    {pending === "remove" ? "Removing..." : "Remove"}
                  </button>
                </div>
              ) : null}
              <form action={uploadDemo} className="asset-upload">
                <input accept="video/mp4,video/webm,video/quicktime" name="file" required type="file" />
                <button className="secondary" disabled={Boolean(pending)} type="submit">
                  {pending === "upload" ? "Uploading..." : demo ? "Replace demo clip" : "Upload demo clip"}
                </button>
              </form>
              {error?.area === "upload" && <p className="error" role="alert">{error.message}</p>}
            </section>
            <section className="production-panel production-render">
              <div className="panel-number">02</div>
              <h2>Render and download</h2>
              <p>Render a quick preview first, then create the narrated final MP4 when it looks right.</p>
              <div className="render-actions">
                <button className="secondary" disabled={Boolean(pending)} onClick={() => void render("preview")}>
                  {pending === "render-preview" ? "Rendering preview..." : "Render preview"}
                </button>
                <button className="primary" disabled={Boolean(pending)} onClick={() => void render("final")}>
                  {pending === "render-final" ? "Rendering final..." : "Render final MP4"}<span>→</span>
                </button>
              </div>
              {(pending.startsWith("render-") || activeJobs.length > 0) && (
                <div className="render-progress" role="status">
                  <div className="progress-track"><span /></div>
                  <strong>Rendering video in the background</strong>
                  <p>This can take a few minutes. Progress updates appear automatically.</p>
                </div>
              )}
              {error?.area === "render" && <p className="error" role="alert">{error.message}</p>}
              <div className="render-list">
                {project.renderJobs.filter((job) => job.status !== "stale").map((job) => (
                  <div className={`render-result status-${job.status}`} key={job.id}>
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
                        onClick={() => void retryRender(job.id)}
                        type="button"
                      >
                        {pending === `retry-${job.id}` ? "Retrying..." : "Retry render"}
                      </button>
                    )}
                    {job.error && <small>{job.error}</small>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <StageNav stage="review" />
      <section className="approval-bar">
        <div>
          <strong>Review the entire deck</strong>
          <span>Approval includes all slides and narration, not only the selected slide.</span>
        </div>
        <button className="primary" disabled={Boolean(pending)} onClick={() => void approveDeck()} type="button">
          {pending === "approve" ? "Approving deck..." : "Approve entire deck & continue to video"}
          <span>→</span>
        </button>
        {error?.area === "approve" && <p className="error" role="alert">{error.message}</p>}
      </section>
      {notice && <p className="workspace-notice success" role="status">{notice}</p>}
      <section className="workspace review-workspace">
        <aside className="slide-list">
          <div className="panel-heading"><span>{revision.slides.length} slides</span><span>{formatTime(total)}</span></div>
          {revision.slides.map((slide, index) => (
            <button
              className={slide.id === selected?.id ? "thumbnail selected" : "thumbnail"}
              key={slide.id}
              onClick={() => selectSlide(slide.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{slide.title}</strong><small>{slide.layout}</small></div>
              <time>{formatTime(slide.durationSeconds)}</time>
            </button>
          ))}
        </aside>
        <div className="preview-panel">
          <div className="preview-toolbar">
            <div>
              <span className={`source source-${revision.source}`}>
                {revision.source === "demo" ? "Demo content" : "AI generated"}
              </span>
              Revision {revision.version}
            </div>
            <div className={Math.abs(durationStatus) > 10 ? "duration-warning" : "duration-ok"}>
              {formatTime(total)} / {formatTime(target)} target
            </div>
          </div>
          {selected && <SlidePreview slide={selected} />}
          <div className="narration-preview">
            <div className="eyebrow">Voiceover</div>
            <p>{selected?.narration}</p>
          </div>
        </div>
        {selected && (
          <aside className="properties-panel" key={`${revision.id}-${selected.id}`}>
            <form action={saveSlide} className="edit-slide-form" onChange={() => setDirty(true)}>
              <div className="panel-heading"><strong>Edit slide</strong><span>{selected.layout}</span></div>
              <label>Title<input name="title" defaultValue={selected.title} required /></label>
              <label>
                Purpose
                <input name="purpose" defaultValue={selected.purpose} required />
                <small className="field-help">The role this slide plays in your story.</small>
              </label>
              <label>
                Key points
                <textarea name="bullets" rows={5} defaultValue={selected.bullets.join("\n")} />
                <small className="field-help">Each line becomes one bullet.</small>
              </label>
              <label>
                Narration
                <textarea name="narration" rows={8} defaultValue={selected.narration} required />
                <small className="field-help">Aim for roughly two spoken words per second.</small>
              </label>
              <label>Duration (seconds)<input min={3} max={180} name="durationSeconds" type="number" defaultValue={selected.durationSeconds} /></label>
              {dirty && <p className="unsaved-note" role="status">Unsaved changes</p>}
              {error?.area === "save" && <p className="error" role="alert">{error.message}</p>}
              <button className="secondary" disabled={pending === "save" || !dirty} type="submit">
                {pending === "save" ? "Saving..." : "Save slide changes"}
              </button>
            </form>
            <div className="copilot-divider"><span>or request a revision</span></div>
            <div className="copilot-box">
              <div><span className="copilot-spark">✦</span><strong>Contextual revision</strong></div>
              {foundryConfigured ? (
                <>
                  <p>Describe the outcome you want. Changes are validated before being saved.</p>
                  <form action={revise}>
                    <textarea name="instruction" rows={3} placeholder="Make the architecture slide more technical..." />
                    <button className="secondary" disabled={pending === "revise"} type="submit">
                      {pending === "revise" ? "Applying..." : "Apply AI revision"}
                    </button>
                  </form>
                </>
              ) : (
                <p>AI revisions are unavailable in demo mode. Edit the slide fields directly instead.</p>
              )}
              {error?.area === "revise" && <p className="error" role="alert">{error.message}</p>}
              {changeSummary && <p className="change-summary">{changeSummary}</p>}
            </div>
          </aside>
        )}
      </section>
    </>
  );
}
