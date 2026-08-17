"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualDurationSeconds,
  activeRevision,
  type PresentationStrategy,
  type Project,
  type Slide,
  type Visual,
} from "@/lib/domain";

const foundryConfigured = process.env.NEXT_PUBLIC_FOUNDRY_CONFIGURED === "true";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function visualLabel(visual: Visual) {
  return visual.type === "demo" ? "Demo storyboard" : `${visual.type} visual`;
}

function hasSemanticDemo(revision: ReturnType<typeof activeRevision>, approvedRevisionId: string | null) {
  return Boolean(
    revision &&
      revision.id === approvedRevisionId &&
      revision.slides.some((slide) => slide.layout === "demo" && slide.visual.type === "demo"),
  );
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

function VisualComposition({ visual }: { visual: Visual }) {
  switch (visual.type) {
    case "statement":
      return <blockquote className="visual-statement">“{visual.statement}”</blockquote>;
    case "cards":
      return <div className="visual-cards">{visual.cards.map((card) => <article key={card.heading}><strong>{card.heading}</strong>{card.body && <span>{card.body}</span>}</article>)}</div>;
    case "flow":
      return <div className="visual-flow">{visual.steps.map((step, index) => <div className="flow-step" key={step.label}><b>{String(index + 1).padStart(2, "0")}</b><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</div>)}</div>;
    case "comparison":
      return <div className="visual-comparison"><div className="comparison-head"><strong>{visual.leftLabel}</strong><strong>{visual.rightLabel}</strong></div>{visual.rows.map((row) => <div className="comparison-row" key={row.label}><span>{row.left}</span><b>{row.label}</b><span>{row.right}</span></div>)}</div>;
    case "metrics":
      return <div className="visual-metrics">{visual.metrics.map((metric) => <article key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span>{metric.detail && <small>{metric.detail}</small>}</article>)}</div>;
    case "timeline":
      return <ol className="visual-timeline">{visual.events.map((event, index) => <li key={event.label}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{event.label}</strong>{event.detail && <span>{event.detail}</span>}</div></li>)}</ol>;
    case "demo":
      return <div className="visual-demo"><div><span>Setup</span><strong>{visual.setup}</strong></div><div><span>Action</span><strong>{visual.action}</strong></div><div><span>Payoff</span><strong>{visual.payoff}</strong></div></div>;
  }
}

function SlidePreview({ slide }: { slide: Slide }) {
  return (
    <div className={`slide-canvas layout-${slide.layout} visual-${slide.visual.type}`}>
      <div className="slide-topline"><span>IDEA2IMPACT</span><span>{slide.layout}</span></div>
      <div className="slide-content">
        <p className="slide-kicker">{slide.purpose}</p>
        <h2>{slide.title}</h2>
        <VisualComposition visual={slide.visual} />
      </div>
      <div className="slide-footer"><span>idea → impact</span><span>{formatTime(slide.durationSeconds)}</span></div>
    </div>
  );
}

function StrategyPanel({ strategy }: { strategy: PresentationStrategy }) {
  const proofNarrative = strategy.proofPoints.length
    ? strategy.proofPoints.map((point) => point.claim).join(" · ")
    : "No external proof points; use the narrative arc to earn the decision.";
  return (
    <section className="strategy-panel" aria-label="Presentation strategy">
      <div className="strategy-heading"><strong>Presentation strategy</strong><span>{strategy.narrativeArc.join(" → ")}</span></div>
      <dl>
        <div><dt>Core message</dt><dd>{strategy.coreMessage}</dd></div>
        <div><dt>Audience goal</dt><dd>{strategy.audienceGoal}</dd></div>
        <div><dt>Proof & narrative</dt><dd>{proofNarrative}</dd></div>
        <div><dt>Voiceover direction</dt><dd>{strategy.voiceoverDirection}</dd></div>
        <div><dt>Demo decision</dt><dd><b>{strategy.demoPlan.recommendation === "include" ? "Include a focused demo" : "Omit the demo"}</b> — {strategy.demoPlan.rationale}</dd></div>
      </dl>
    </section>
  );
}

function VisualEditor({ visual }: { visual: Visual }) {
  switch (visual.type) {
    case "statement":
      return <label>Statement<textarea name="visual-statement" defaultValue={visual.statement} required rows={3} /></label>;
    case "cards":
      return <fieldset className="visual-editor"><legend>Cards</legend>{visual.cards.map((card, index) => <div className="visual-editor-row" key={`${card.heading}-${index}`}><label>Heading<input defaultValue={card.heading} name={`card-heading-${index}`} required /></label><label>Supporting text<input defaultValue={card.body ?? ""} name={`card-body-${index}`} /></label></div>)}</fieldset>;
    case "flow":
      return <fieldset className="visual-editor"><legend>Flow steps</legend>{visual.steps.map((step, index) => <div className="visual-editor-row" key={`${step.label}-${index}`}><label>Step<input defaultValue={step.label} name={`flow-label-${index}`} required /></label><label>Detail<input defaultValue={step.detail ?? ""} name={`flow-detail-${index}`} /></label></div>)}</fieldset>;
    case "comparison":
      return <fieldset className="visual-editor"><legend>Comparison</legend><div className="visual-editor-row"><label>Left label<input defaultValue={visual.leftLabel} name="comparison-left-label" required /></label><label>Right label<input defaultValue={visual.rightLabel} name="comparison-right-label" required /></label></div>{visual.rows.map((row, index) => <div className="comparison-editor-row" key={`${row.label}-${index}`}><label>Measure<input defaultValue={row.label} name={`comparison-label-${index}`} required /></label><label>Left<input defaultValue={row.left} name={`comparison-left-${index}`} required /></label><label>Right<input defaultValue={row.right} name={`comparison-right-${index}`} required /></label></div>)}</fieldset>;
    case "metrics":
      return <fieldset className="visual-editor"><legend>Metrics</legend>{visual.metrics.map((metric, index) => <div className="metric-editor-row" key={`${metric.label}-${index}`}><label>Value<input defaultValue={metric.value} name={`metric-value-${index}`} required /></label><label>Label<input defaultValue={metric.label} name={`metric-label-${index}`} required /></label><label>Detail<input defaultValue={metric.detail ?? ""} name={`metric-detail-${index}`} /></label></div>)}</fieldset>;
    case "timeline":
      return <fieldset className="visual-editor"><legend>Timeline events</legend>{visual.events.map((event, index) => <div className="visual-editor-row" key={`${event.label}-${index}`}><label>Event<input defaultValue={event.label} name={`timeline-label-${index}`} required /></label><label>Detail<input defaultValue={event.detail ?? ""} name={`timeline-detail-${index}`} /></label></div>)}</fieldset>;
    case "demo":
      return <fieldset className="visual-editor"><legend>Demo storyboard</legend><label>Setup<textarea defaultValue={visual.setup} name="demo-setup" required rows={2} /></label><label>Action<textarea defaultValue={visual.action} name="demo-action" required rows={2} /></label><label>Payoff<textarea defaultValue={visual.payoff} name="demo-payoff" required rows={2} /></label></fieldset>;
  }
}

function formText(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalFormText(formData: FormData, name: string) {
  return formText(formData, name) || undefined;
}

function visualFromForm(formData: FormData, visual: Visual): Visual {
  switch (visual.type) {
    case "statement": return { type: "statement", statement: formText(formData, "visual-statement") };
    case "cards": return { type: "cards", cards: visual.cards.map((_, index) => ({ heading: formText(formData, `card-heading-${index}`), body: optionalFormText(formData, `card-body-${index}`) })) };
    case "flow": return { type: "flow", steps: visual.steps.map((_, index) => ({ label: formText(formData, `flow-label-${index}`), detail: optionalFormText(formData, `flow-detail-${index}`) })) };
    case "comparison": return { type: "comparison", leftLabel: formText(formData, "comparison-left-label"), rightLabel: formText(formData, "comparison-right-label"), rows: visual.rows.map((_, index) => ({ label: formText(formData, `comparison-label-${index}`), left: formText(formData, `comparison-left-${index}`), right: formText(formData, `comparison-right-${index}`) })) };
    case "metrics": return { type: "metrics", metrics: visual.metrics.map((_, index) => ({ value: formText(formData, `metric-value-${index}`), label: formText(formData, `metric-label-${index}`), detail: optionalFormText(formData, `metric-detail-${index}`) })) };
    case "timeline": return { type: "timeline", events: visual.events.map((_, index) => ({ label: formText(formData, `timeline-label-${index}`), detail: optionalFormText(formData, `timeline-detail-${index}`) })) };
    case "demo": return { type: "demo", setup: formText(formData, "demo-setup"), action: formText(formData, "demo-action"), payoff: formText(formData, "demo-payoff") };
  }
}

export function ProjectWorkspace({ initialProject }: { initialProject: Project }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const revision = activeRevision(project);
  const [selectedId, setSelectedId] = useState(revision?.slides[0]?.id ?? "");
  const [pending, setPending] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<{ area: string; message: string } | null>(project.lastError ? { area: "workspace", message: project.lastError } : null);
  const [notice, setNotice] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const selected = revision?.slides.find((slide) => slide.id === selectedId) ?? revision?.slides[0];
  const total = revision ? actualDurationSeconds(revision) : 0;
  const target = project.input.durationMinutes * 60;
  const durationStatus = Math.round(((total - target) / target) * 100);

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

  async function generate() {
    setPending("generate"); setError(null);
    const response = await fetch(`/api/projects/${project.id}/generate`, { method: "POST" });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("generate", body.error ?? "Could not generate the presentation");
    setProject(body); setSelectedId(body.revisions.at(-1)?.slides[0]?.id ?? ""); router.refresh();
  }

  async function approveDeck() {
    if (dirty && !window.confirm("You have unsaved slide changes. Discard them and continue?")) return;
    setDirty(false); setPending("approve"); setError(null);
    const response = await fetch(`/api/projects/${project.id}/approve`, { method: "POST" });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("approve", body.error ?? "Could not approve the deck");
    setProject(body); setNotice("The complete deck and narration are approved."); router.refresh();
  }

  async function render(kind: "preview" | "final") {
    setPending(`render-${kind}`); setError(null); setNotice(`${kind === "preview" ? "Preview" : "Final video"} rendering started.`);
    const response = await fetch(`/api/projects/${project.id}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    const body = await response.json(); setPending("");
    if (!response.ok) {
      reportError("render", body.error ?? "Rendering failed");
      const latest = await fetch(`/api/projects/${project.id}`).then((result) => result.json());
      if (latest.id) setProject(latest);
      return;
    }
    setProject(body); setNotice(`${kind === "preview" ? "Preview" : "Final video"} is ready to download.`); router.refresh();
  }

  async function saveSlide(formData: FormData) {
    if (!selected || !revision) return;
    setPending("save"); setError(null);
    const response = await fetch(`/api/projects/${project.id}/slides/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: revision.version,
        changes: {
          title: formData.get("title"),
          purpose: formData.get("purpose"),
          audienceTakeaway: formData.get("audienceTakeaway"),
          bullets: String(formData.get("bullets")).split("\n").map((item) => item.trim()).filter(Boolean),
          visual: visualFromForm(formData, selected.visual),
          narration: formData.get("narration"),
          durationSeconds: Number(formData.get("durationSeconds")),
        },
      }),
    });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("save", body.error ?? "Could not save the slide");
    setProject(body); setDirty(false); setNotice("Slide changes saved."); router.refresh();
  }

  async function revise(formData: FormData) {
    if (!revision) return;
    const instruction = formText(formData, "instruction");
    if (!instruction) return;
    if (dirty && !window.confirm("Discard unsaved slide changes and apply an AI revision?")) return;
    setPending("revise"); setError(null); setChangeSummary("");
    const response = await fetch(`/api/projects/${project.id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction, expectedVersion: revision.version }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("revise", body.error ?? "AI revision failed");
    setProject(body.project); setDirty(false); setChangeSummary(body.summary); setNotice("AI revision applied."); router.refresh();
  }

  async function uploadDemo(formData: FormData) {
    setPending("upload"); setError(null);
    const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: formData });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("upload", body.error ?? "Upload failed");
    setProject(body); setNotice("Demo clip uploaded."); router.refresh();
  }

  async function removeDemo() {
    setPending("remove"); setError(null);
    const response = await fetch(`/api/projects/${project.id}/assets`, { method: "DELETE" });
    const body = await response.json(); setPending("");
    if (!response.ok) return reportError("upload", body.error ?? "Could not remove the demo clip");
    setProject(body); setNotice("Demo clip removed."); router.refresh();
  }

  function selectSlide(id: string) {
    if (id === selected?.id) return;
    if (dirty && !window.confirm("Discard unsaved changes to this slide?")) return;
    setDirty(false); setError(null); setNotice(""); setSelectedId(id);
  }

  if (!revision) {
    return <><StageNav stage="brief" /><section className="generation-workspace" aria-live="polite"><h1>Turning your idea into a clear story.</h1>{pending === "generate" && <div className="progress-track"><span /></div>}<p>We&apos;re analyzing the brief, planning the narrative, and creating slides with narration.</p>{!pending && !error && <button className="primary wide" onClick={() => void generate()} type="button">Continue generation <span>→</span></button>}{error?.area === "generate" && <><p className="error" role="alert">{error.message}</p><button className="primary wide" onClick={() => void generate()} type="button">Retry generation <span>→</span></button></>}{!foundryConfigured && <p className="mode-note">Demo mode uses sample-generated content so you can explore the complete workflow.</p>}</section></>;
  }

  if (project.stage === "produce") {
    const demoSlide = revision.slides.find((slide) => slide.layout === "demo" && slide.visual.type === "demo");
    const canUseDemo = hasSemanticDemo(revision, project.approvedDeckRevisionId);
    const demo = project.assets.find((asset) => asset.kind === "demo-video");
    const activeJobs = project.renderJobs.filter((job) => job.status === "queued" || job.status === "rendering");
    return <><StageNav stage="produce" /><main className="production-workspace"><header className="production-heading"><div><h1>Bring the approved story to life.</h1></div><div className="approved-badge">✓ Deck approved</div></header>{notice && <p className="success" role="status">{notice}</p>}<div className="production-grid"><section className="production-panel">{canUseDemo && demoSlide?.visual.type === "demo" ? <><h2>Demo moment</h2><p className="demo-guidance">The clip supports this slide&apos;s promised proof. Keep the voiceover focused on the audience outcome—not controls.</p><dl className="demo-plan"><div><dt>Setup</dt><dd>{demoSlide.visual.setup}</dd></div><div><dt>Action</dt><dd>{demoSlide.visual.action}</dd></div><div><dt>Payoff</dt><dd>{demoSlide.visual.payoff}</dd></div></dl><p className="field-help">MP4, WebM, or QuickTime · maximum 100 MB</p>{demo ? <div className="asset-summary"><div><strong>{demo.name}</strong><small>{(demo.size / 1024 / 1024).toFixed(1)} MB</small></div><button className="text-button" disabled={Boolean(pending)} onClick={() => void removeDemo()} type="button">{pending === "remove" ? "Removing..." : "Remove"}</button></div> : null}<form action={uploadDemo} className="asset-upload"><input accept="video/mp4,video/webm,video/quicktime" name="file" required type="file" /><button className="secondary" disabled={Boolean(pending)} type="submit">{pending === "upload" ? "Uploading..." : demo ? "Replace demo clip" : "Upload demo clip"}</button></form></> : <><h2>No demo clip for this deck</h2><p>This approved deck does not contain a semantic demo slide, so a video upload would not have a defined story moment.</p><p className="demo-guidance">{revision.strategy.demoPlan.rationale}</p></>}{error?.area === "upload" && <p className="error" role="alert">{error.message}</p>}</section><section className="production-panel production-render"><h2>Render and download</h2><p>Render a quick preview first, then create the narrated final MP4 when it looks right.</p><div className="render-actions"><button className="secondary" disabled={Boolean(pending)} onClick={() => void render("preview")}>{pending === "render-preview" ? "Rendering preview..." : "Render preview"}</button><button className="primary" disabled={Boolean(pending)} onClick={() => void render("final")}>{pending === "render-final" ? "Rendering final..." : "Render final MP4"}<span>→</span></button></div>{(pending.startsWith("render-") || activeJobs.length > 0) && <div className="render-progress" role="status"><div className="progress-track"><span /></div><strong>Rendering video</strong><p>This can take a few minutes. Keep this page open.</p></div>}{error?.area === "render" && <p className="error" role="alert">{error.message}</p>}<div className="render-list">{project.renderJobs.map((job) => <div className={`render-result status-${job.status}`} key={job.id}><span>{job.kind} · {job.status}</span>{job.outputUrl && <a href={job.outputUrl}>Download MP4 ↓</a>}{job.error && <small>{job.error}</small>}</div>)}</div></section></div></main></>;
  }

  return <><StageNav stage="review" /><section className="approval-bar"><div><strong>Review the entire deck</strong><span>Approval includes all slides and narration, not only the selected slide.</span></div><button className="primary" disabled={Boolean(pending)} onClick={() => void approveDeck()} type="button">{pending === "approve" ? "Approving deck..." : "Approve entire deck & continue to video"}<span>→</span></button>{error?.area === "approve" && <p className="error" role="alert">{error.message}</p>}</section>{notice && <p className="workspace-notice success" role="status">{notice}</p>}<section className="workspace review-workspace"><aside className="slide-list"><div className="panel-heading"><span>{revision.slides.length} slides</span><span>{formatTime(total)}</span></div>{revision.slides.map((slide, index) => <button className={slide.id === selected?.id ? "thumbnail selected" : "thumbnail"} key={slide.id} onClick={() => selectSlide(slide.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{slide.title}</strong><small>{slide.layout} · {slide.visual.type}</small></div><time>{formatTime(slide.durationSeconds)}</time></button>)}</aside><div className="preview-panel"><div className="preview-toolbar"><div><span className={`source source-${revision.source}`}>{revision.source === "demo" ? "Demo content" : "AI generated"}</span>Revision {revision.version}</div><div className={Math.abs(durationStatus) > 10 ? "duration-warning" : "duration-ok"}>{formatTime(total)} / {formatTime(target)} target</div></div>{selected && <SlidePreview slide={selected} />}<div className="slide-intent"><div><span>Audience takeaway</span><p>{selected?.audienceTakeaway}</p></div><div><span>Visual intent</span><p>{selected && visualLabel(selected.visual)} — the on-screen structure is designed to make this slide&apos;s point scannable before the narration adds context.</p></div></div><div className="narration-preview"><strong>Voiceover</strong><p>{selected?.narration}</p></div><StrategyPanel strategy={revision.strategy} /></div>{selected && <aside className="properties-panel" key={`${revision.id}-${selected.id}`}><form action={saveSlide} className="edit-slide-form" onChange={() => setDirty(true)}><div className="panel-heading"><strong>Edit slide</strong><span>{selected.layout} · {selected.visual.type}</span></div><label>Title<input name="title" defaultValue={selected.title} required /></label><label>Purpose<input name="purpose" defaultValue={selected.purpose} required /><small className="field-help">The role this slide plays in your story.</small></label><label>Audience takeaway<textarea name="audienceTakeaway" defaultValue={selected.audienceTakeaway} required rows={3} /></label><label>Key points<textarea name="bullets" rows={5} defaultValue={selected.bullets.join("\n")} /><small className="field-help">Each line becomes one bullet.</small></label><VisualEditor visual={selected.visual} /><label>Narration<textarea name="narration" rows={8} defaultValue={selected.narration} required /><small className="field-help">Aim for roughly two spoken words per second.</small></label><label>Duration (seconds)<input min={3} max={180} name="durationSeconds" type="number" defaultValue={selected.durationSeconds} /></label>{dirty && <p className="unsaved-note" role="status">Unsaved changes</p>}{error?.area === "save" && <p className="error" role="alert">{error.message}</p>}<button className="secondary" disabled={pending === "save" || !dirty} type="submit">{pending === "save" ? "Saving..." : "Save slide changes"}</button></form><div className="copilot-divider"><span>or request a revision</span></div><div className="copilot-box"><div><span className="copilot-spark">✦</span><strong>Contextual revision</strong></div>{foundryConfigured ? <><p>Describe the outcome you want. Changes are validated before being saved.</p><form action={revise}><textarea name="instruction" rows={3} placeholder="Make the architecture slide more technical..." /><button className="secondary" disabled={pending === "revise"} type="submit">{pending === "revise" ? "Applying..." : "Apply AI revision"}</button></form></> : <p>AI revisions are unavailable in demo mode. Edit the slide fields directly instead.</p>}{error?.area === "revise" && <p className="error" role="alert">{error.message}</p>}{changeSummary && <p className="change-summary">{changeSummary}</p>}</div></aside>}</section></>;
}
