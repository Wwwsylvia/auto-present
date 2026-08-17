"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const durations = [1, 2, 3, 5];
const generationSteps = [
  "Analyzing your brief",
  "Planning the narrative",
  "Creating slides and narration",
];

export function NewProjectForm() {
  const router = useRouter();
  const [duration, setDuration] = useState(2);
  const [customDuration, setCustomDuration] = useState(false);
  const [pending, setPending] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    let interval: number | undefined;
    try {
      let id = projectId;
      if (!id) {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea: formData.get("idea"),
            audience: formData.get("audience"),
            tone: formData.get("tone"),
            durationMinutes: duration,
            githubUrl: formData.get("githubUrl"),
          }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Could not create the project");
          setPending(false);
          return;
        }
        id = body.id;
        setProjectId(id);
      }

      interval = window.setInterval(
        () => setGenerationStep((current) => Math.min(current + 1, generationSteps.length - 1)),
        1800,
      );
      const generation = await fetch(`/api/projects/${id}/generate`, { method: "POST" });
      const body = await generation.json();
      if (!generation.ok) {
        setError(body.error ?? "Could not generate the presentation");
        setPending(false);
        return;
      }
      router.push(`/projects/${id}`);
    } catch {
      setError("The connection was interrupted. Retry generation to continue.");
      setPending(false);
    } finally {
      if (interval !== undefined) window.clearInterval(interval);
    }
  }

  return (
    <form action={submit} className="brief-card">
      <div className="eyebrow">New presentation</div>
      {pending ? (
        <div className="generation-state" aria-live="polite">
          <div className="progress-track"><span /></div>
          <strong>{generationSteps[generationStep]}</strong>
          <p>Keep this page open while we shape your deck.</p>
        </div>
      ) : (
        <>
          <label>
            What are you building?
            <textarea
              name="idea"
              required
              minLength={20}
              placeholder="Describe the problem, your solution, and what makes it worth showing..."
              rows={5}
            />
          </label>
          <div className="form-grid">
            <label>
              Audience
              <input name="audience" defaultValue="Hackathon judges" required />
            </label>
            <label>
              Tone
              <select name="tone" defaultValue="confident">
                <option value="confident">Confident</option>
                <option value="conversational">Conversational</option>
                <option value="technical">Technical</option>
                <option value="inspiring">Inspiring</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Target duration</legend>
            <div className="duration-row">
              {durations.map((value) => (
                <button
                  className={!customDuration && duration === value ? "duration active" : "duration"}
                  key={value}
                  onClick={() => {
                    setCustomDuration(false);
                    setDuration(value);
                  }}
                  type="button"
                >
                  {value} min
                </button>
              ))}
              <button
                className={customDuration ? "duration active" : "duration"}
                onClick={() => setCustomDuration(true)}
                type="button"
              >
                Custom
              </button>
              {customDuration && (
                <input
                  aria-label="Custom duration in minutes"
                  className="custom-duration-input"
                  max={10}
                  min={1}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  type="number"
                  value={duration}
                />
              )}
            </div>
          </fieldset>
          <label>
            Public GitHub repository <span className="optional">Optional</span>
            <input name="githubUrl" placeholder="https://github.com/owner/repository" type="url" />
            <small className="field-help">
              We read selected public repository files to ground the deck in your implementation.
            </small>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={pending} type="submit">
            {projectId ? "Retry generation" : "Shape my story"}
            <span aria-hidden="true">→</span>
          </button>
          <p className="privacy-note">Your idea stays in this deployment. Public repositories are read-only.</p>
        </>
      )}
    </form>
  );
}
