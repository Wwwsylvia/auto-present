import { repositorySnapshotSchema, type RepositorySnapshot } from "@/lib/domain";

const githubUrlPattern = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i;
const usefulFiles = [
  "README.md",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
];
const maxEvidenceCharacters = 24_000;

export function parseGitHubUrl(value: string): { owner: string; repo: string } {
  const match = githubUrlPattern.exec(value.trim());
  if (!match) {
    throw new Error("Enter a public GitHub repository URL such as https://github.com/owner/repo");
  }
  return { owner: match[1], repo: match[2] };
}

async function githubFetch(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Idea2Impact",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("The public GitHub repository could not be found");
    }
    if (response.status === 403) {
      throw new Error("GitHub API rate limit reached; configure GITHUB_TOKEN or try later");
    }
    throw new Error(`GitHub returned ${response.status}`);
  }
  return response;
}

export async function inspectPublicRepository(url: string): Promise<RepositorySnapshot> {
  const { owner, repo } = parseGitHubUrl(url);
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const [metadataResponse, languagesResponse, commitResponse] = await Promise.all([
    githubFetch(base),
    githubFetch(`${base}/languages`),
    githubFetch(`${base}/commits?per_page=1`),
  ]);
  const metadata = (await metadataResponse.json()) as {
    description: string | null;
    default_branch: string;
    html_url: string;
  };
  const languages = (await languagesResponse.json()) as Record<string, number>;
  const commits = (await commitResponse.json()) as Array<{ sha: string }>;

  let remaining = maxEvidenceCharacters;
  const evidence = [];
  for (const file of usefulFiles) {
    if (remaining <= 0) break;
    const response = await fetch(`${base}/contents/${encodeURIComponent(file)}`, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        "User-Agent": "Idea2Impact",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      cache: "no-store",
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`GitHub could not read ${file} (${response.status})`);
    const excerpt = (await response.text()).slice(0, Math.min(remaining, 12_000));
    remaining -= excerpt.length;
    evidence.push({
      path: file,
      excerpt,
      url: `${metadata.html_url}/blob/${metadata.default_branch}/${file}`,
    });
  }

  return repositorySnapshotSchema.parse({
    url: metadata.html_url,
    owner,
    repo,
    commitSha: commits[0]?.sha ?? metadata.default_branch,
    description: metadata.description,
    languages: Object.keys(languages).slice(0, 8),
    evidence,
  });
}
