import { repositorySnapshotSchema, type RepositorySnapshot } from "@/lib/domain";

const githubUrlPattern = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i;
const maxTreeCandidates = 32;
const maxContentRequests = 8;
const maxEvidenceFiles = 6;
const maxEvidenceCharacters = 24_000;
const maxExcerptCharacters = 6_000;
const maxFileBytes = 128 * 1024;

const manifestNames = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gemfile",
  "composer.json",
  "mix.exs",
]);
const lockfileNames = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "cargo.lock",
  "poetry.lock",
  "pipfile.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
]);
const generatedDirectories = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "target",
  "vendor",
]);
const binaryExtensions = new Set([
  "7z",
  "avi",
  "bmp",
  "class",
  "dll",
  "dmg",
  "doc",
  "docx",
  "eot",
  "exe",
  "gif",
  "gz",
  "ico",
  "jar",
  "jpeg",
  "jpg",
  "lockb",
  "mp3",
  "mp4",
  "otf",
  "pdf",
  "png",
  "so",
  "tar",
  "ttf",
  "wasm",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xlsx",
  "zip",
]);

type EvidenceCategory =
  | "readme"
  | "documentation"
  | "manifest"
  | "entry-point"
  | "route"
  | "schema"
  | "test"
  | "deployment";

type TreeEntry = {
  path: string;
  type: string;
  size?: number;
};

type RankedFile = {
  path: string;
  category: EvidenceCategory;
  score: number;
};

export type RepositoryInspectionOptions = {
  fetch?: typeof fetch;
};

export function parseGitHubUrl(value: string): { owner: string; repo: string } {
  const match = githubUrlPattern.exec(value.trim());
  if (!match) {
    throw new Error("Enter a public GitHub repository URL such as https://github.com/owner/repo");
  }
  return { owner: match[1], repo: match[2] };
}

function githubHeaders(accept: string): HeadersInit {
  return {
    Accept: accept,
    "User-Agent": "Idea2Impact",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

async function githubFetch(url: string, fetcher: typeof fetch): Promise<Response> {
  const response = await fetcher(url, {
    headers: githubHeaders("application/vnd.github+json"),
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

function isExcluded(path: string, size?: number): boolean {
  const parts = path.toLowerCase().split("/");
  const filename = parts.at(-1) ?? "";
  const extension = filename.includes(".") ? (filename.split(".").at(-1) ?? "") : "";

  return (
    !path ||
    (size !== undefined && (size <= 0 || size > maxFileBytes)) ||
    parts.some((part) => generatedDirectories.has(part)) ||
    lockfileNames.has(filename) ||
    binaryExtensions.has(extension) ||
    filename.endsWith(".map") ||
    filename.includes(".min.") ||
    filename.includes(".generated.") ||
    parts.some((part) => /(?:^|\.)env(?:\.|$)/.test(part)) ||
    parts.some((part) =>
      /^(?:secrets?|credentials?|id_rsa|private[_-]?key)(?:[._-]|$)/.test(part),
    )
  );
}

function classifyFile(path: string): EvidenceCategory | undefined {
  const normalized = path.toLowerCase();
  const parts = normalized.split("/");
  const filename = parts.at(-1) ?? "";
  const hasDirectory = (...directories: string[]) => parts.slice(0, -1).some((part) => directories.includes(part));

  if (/^readme(?:\.[a-z0-9]+)?$/i.test(filename)) return "readme";
  if (
    hasDirectory("docs", "doc") ||
    /^(?:contributing|changelog|architecture|overview|guide)(?:\.[a-z0-9]+)?$/i.test(filename)
  ) {
    return "documentation";
  }
  if (manifestNames.has(filename) || /\.(?:csproj|fsproj|vbproj)$/.test(filename)) return "manifest";
  if (
    filename === "dockerfile" ||
    filename.startsWith("docker-compose") ||
    hasDirectory(".github", "workflows", "deploy", "deployment", "infra", "k8s", "kubernetes", "helm") ||
    /(?:^|\/)(?:docker|compose|fly|vercel|netlify|render)\.(?:ya?ml|json|toml)$/i.test(normalized)
  ) {
    return "deployment";
  }
  if (
    hasDirectory("api", "apis", "routes", "route", "controllers", "controller") ||
    /(?:^|\/)route\.[^.]+$/i.test(normalized)
  ) {
    return "route";
  }
  if (
    hasDirectory("schemas", "schema", "models", "model", "prisma", "migrations") ||
    /(?:^|\/)(?:schema|model)\.[^.]+$/i.test(normalized)
  ) {
    return "schema";
  }
  if (
    hasDirectory("test", "tests", "__tests__", "spec") ||
    /(?:^|\/)[^.]+\.(?:test|spec)\.[^.]+$/i.test(normalized)
  ) {
    return "test";
  }
  if (
    /^(?:main|index|server|app)\.[^.]+$/i.test(filename) ||
    /(?:^|\/)(?:src|app|pages)\/(?:main|index|server|app|page)\.[^.]+$/i.test(normalized)
  ) {
    return "entry-point";
  }
  return undefined;
}

function rankFor(category: EvidenceCategory, path: string): number {
  const categoryScores: Record<EvidenceCategory, number> = {
    readme: 8_000,
    documentation: 7_000,
    manifest: 6_000,
    "entry-point": 5_000,
    route: 4_500,
    schema: 4_000,
    test: 3_000,
    deployment: 5_500,
  };
  const depth = path.split("/").length - 1;
  return categoryScores[category] + Math.max(0, 100 - depth);
}

export function selectRepositoryFiles(entries: TreeEntry[]): Array<Pick<RankedFile, "path" | "category">> {
  const ranked = entries
    .filter((entry) => entry.type === "blob" && !isExcluded(entry.path, entry.size))
    .map((entry) => {
      const category = classifyFile(entry.path);
      return category ? { path: entry.path, category, score: rankFor(category, entry.path) } : undefined;
    })
    .filter((entry): entry is RankedFile => entry !== undefined)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const selected: RankedFile[] = [];
  const selectedPaths = new Set<string>();
  for (const category of [
    "readme",
    "documentation",
    "manifest",
    "deployment",
    "entry-point",
    "route",
    "schema",
    "test",
  ] satisfies EvidenceCategory[]) {
    const candidate = ranked.find((entry) => entry.category === category);
    if (candidate) {
      selected.push(candidate);
      selectedPaths.add(candidate.path);
    }
  }
  selected.push(...ranked.filter((entry) => !selectedPaths.has(entry.path)));
  return selected
    .slice(0, maxTreeCandidates)
    .map(({ path, category }) => ({ path, category }));
}

function encodeRepositoryPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function inspectPublicRepository(
  url: string,
  options: RepositoryInspectionOptions = {},
): Promise<RepositorySnapshot> {
  const { owner, repo } = parseGitHubUrl(url);
  const fetcher = options.fetch ?? fetch;
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const metadataResponse = await githubFetch(base, fetcher);
  const metadata = (await metadataResponse.json()) as {
    description: string | null;
    default_branch: string;
    html_url: string;
    private?: boolean;
  };
  if (metadata.private) {
    throw new Error("The public GitHub repository could not be found");
  }

  const [languagesResponse, commitResponse] = await Promise.all([
    githubFetch(`${base}/languages`, fetcher),
    githubFetch(`${base}/commits?sha=${encodeURIComponent(metadata.default_branch)}&per_page=1`, fetcher),
  ]);
  const languages = (await languagesResponse.json()) as Record<string, number>;
  const commits = (await commitResponse.json()) as Array<{ sha: string }>;
  const commitSha = commits[0]?.sha;
  if (!commitSha) {
    throw new Error("GitHub did not return a repository commit");
  }

  const treeResponse = await githubFetch(
    `${base}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    fetcher,
  );
  const tree = (await treeResponse.json()) as { tree?: TreeEntry[] };
  const candidates = selectRepositoryFiles(Array.isArray(tree.tree) ? tree.tree : []);

  let remaining = maxEvidenceCharacters;
  let requests = 0;
  const evidence: Array<{ path: string; excerpt: string; url: string; category: EvidenceCategory }> = [];
  for (const candidate of candidates) {
    if (remaining <= 0 || requests >= maxContentRequests || evidence.length >= maxEvidenceFiles) break;
    requests += 1;
    const response = await fetcher(
      `${base}/contents/${encodeRepositoryPath(candidate.path)}?ref=${encodeURIComponent(commitSha)}`,
      {
        headers: githubHeaders("application/vnd.github.raw+json"),
        cache: "no-store",
      },
    );
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`GitHub could not read ${candidate.path} (${response.status})`);

    const content = await response.text();
    if (content.includes("\0")) continue;
    const excerpt = content.slice(0, Math.min(remaining, maxExcerptCharacters));
    if (!excerpt) continue;
    remaining -= excerpt.length;
    evidence.push({
      path: candidate.path,
      category: candidate.category,
      excerpt,
      url: `${metadata.html_url}/blob/${commitSha}/${encodeRepositoryPath(candidate.path)}`,
    });
  }

  return repositorySnapshotSchema.parse({
    url: metadata.html_url,
    owner,
    repo,
    commitSha,
    description: metadata.description,
    languages: Object.entries(languages)
      .sort(([leftName, leftSize], [rightName, rightSize]) => rightSize - leftSize || leftName.localeCompare(rightName))
      .slice(0, 8)
      .map(([language]) => language),
    evidence,
  });
}
