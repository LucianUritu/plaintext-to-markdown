//handles versioned branch naming and fetching the published-version history for a book repository
export function isValidVersionLabel(version) {
  if (typeof version !== "string") return false;

  const trimmed = version.trim();

  if (!trimmed) return false;
  if (/^(main|master)$/i.test(trimmed)) return false;
  if (trimmed.length > 64) return false;

  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed);
}

export function versionToBranchName(version) {
  const slug = String(version || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "");

  return "version/" + slug;
}

export function branchNameToVersion(branchName) {
  const prefix = "version/";

  if (typeof branchName !== "string") return null;
  if (!branchName.startsWith(prefix)) return null;

  const label = branchName.slice(prefix.length);
  return label || null;
}

export async function loadVersionHistory({ owner, repo }) {
  if (!owner || !repo) {
    throw new Error("owner and repo are required to load version history.");
  }

  const branches = await fetchVersionBranches({ owner, repo });

  const enriched = await Promise.all(
    branches.map(function (branch) {
      return enrichBranch({ owner, repo, branch });
    })
  );
  
  enriched.sort(function (a, b) {
    if (a.committedAt && b.committedAt) {
      return b.committedAt.localeCompare(a.committedAt);
    }
    return b.branch.localeCompare(a.branch);
  });

  return enriched;
}

async function fetchVersionBranches({ owner, repo }) {
  const url =
    "/api/github/branches?" +
    new URLSearchParams({ owner, repo, prefix: "version/", per_page: "100" });

  const response = await fetch(url);

  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(
      (body && body.error) || "Could not load version branches from GitHub."
    );
  }

  const data = await response.json();
  
  return Array.isArray(data.branches) ? data.branches : [];
}

async function enrichBranch({ owner, repo, branch }) {
  const version = branchNameToVersion(branch.name) || branch.name;
  const pagesUrl = buildPagesUrl(owner, repo, branch.name);

  try {
    const url =
      "/api/github/commit?" +
      new URLSearchParams({ owner, repo, sha: branch.commitSha });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("non-OK response");
    }

    const data = await response.json();
    const committedAt =
      (data.commit && data.commit.author && data.commit.author.date) || null;

    return {
      version,
      branch: branch.name,
      commitSha: branch.commitSha,
      committedAt,
      pagesUrl
    };
  } catch {
    return {
      version,
      branch: branch.name,
      commitSha: branch.commitSha,
      committedAt: null,
      pagesUrl
    };
  }
}

function buildPagesUrl(owner, repo, branch) {
  // GitHub Pages subfolder is the branch name with "/" replaced by "-"
  const folder = branch.replace(/\//g, "-");
  return (
    "https://" + owner + ".github.io/" + repo + "/" + folder + "/"
  );
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
