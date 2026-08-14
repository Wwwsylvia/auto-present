"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const durations = [1, 2, 3, 5];

export function NewProjectForm() {
  const router = useRouter();
  const [duration, setDuration] = useState(2);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
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
    router.push(`/projects/${body.id}`);
  }

  return (
    <form action={submit} className="brief-card">
      <div className="eyebrow">New presentation</div>
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
              className={duration === value ? "duration active" : "duration"}
              key={value}
              onClick={() => setDuration(value)}
              type="button"
            >
              {value} min
            </button>
          ))}
          <label className="custom-duration">
            Custom
            <input
              aria-label="Custom duration in minutes"
              max={10}
              min={1}
              onChange={(event) => setDuration(Number(event.target.value))}
              type="number"
              value={duration}
            />
          </label>
        </div>
      </fieldset>
      <label>
        Public GitHub repository <span className="optional">Optional</span>
        <input name="githubUrl" placeholder="https://github.com/owner/repository" type="url" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Creating..." : "Shape my story"}
        <span aria-hidden="true">→</span>
      </button>
      <p className="privacy-note">Your idea stays in this deployment. Public repositories are read-only.</p>
    </form>
  );
}
