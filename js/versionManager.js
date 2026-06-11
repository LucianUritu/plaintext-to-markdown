export class VersionBranchNaming {
  constructor({ prefix = "version/" } = {}) {
    this.prefix = prefix;
  }

  isValidLabel(version) {
    if (typeof version !== "string") return false;

    const trimmed = version.trim();
    const branchName = this.toBranchName(trimmed);
    const slug = branchName.slice(this.prefix.length);

    if (!trimmed) return false;
    if (/^(main|master)$/i.test(trimmed)) return false;
    if (trimmed.length > 64) return false;
    if (!slug) return false;
    if (/^(main|master)$/i.test(slug)) return false;

    return /^[a-z0-9][a-z0-9._-]*$/.test(slug);
  }

  toBranchName(version) {
    const slug = String(version || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/^-+|-+$/g, "");

    return this.prefix + slug;
  }

  toVersionLabel(branchName) {
    if (typeof branchName !== "string") return null;
    if (!branchName.startsWith(this.prefix)) return null;

    const label = branchName.slice(this.prefix.length);
    return label || null;
  }
}

export class VersionApiClient {
  async listBranches({ owner, repo }) {
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

  async getCommit({ owner, repo, sha }) {
    const url =
      "/api/github/commit?" +
      new URLSearchParams({ owner, repo, sha });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Could not load commit details.");
    }

    return response.json();
  }
}

export class VersionManager {
  constructor({
    naming = new VersionBranchNaming(),
    apiClient = new VersionApiClient()
  } = {}) {
    this.naming = naming;
    this.apiClient = apiClient;
  }

  isValidVersionLabel(version) {
    return this.naming.isValidLabel(version);
  }

  versionToBranchName(version) {
    return this.naming.toBranchName(version);
  }

  branchNameToVersion(branchName) {
    return this.naming.toVersionLabel(branchName);
  }

  async loadHistory({ owner, repo }) {
    if (!owner || !repo) {
      throw new Error("owner and repo are required to load version history.");
    }

    const branches = await this.apiClient.listBranches({ owner, repo });
    const enriched = await Promise.all(
      branches.map((branch) => this.enrichBranch({ owner, repo, branch }))
    );

    return enriched.sort(compareNewestFirst);
  }

  async enrichBranch({ owner, repo, branch }) {
    const version = branch.version || this.branchNameToVersion(branch.name) || branch.name;
    const pagesUrl = branch.pagesUrl || buildPagesUrl(owner, repo, branch.name);

    try {
      const data = await this.apiClient.getCommit({
        owner,
        repo,
        sha: branch.commitSha
      });
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
}

const defaultVersionManager = new VersionManager();

export function isValidVersionLabel(version) {
  return defaultVersionManager.isValidVersionLabel(version);
}

export function versionToBranchName(version) {
  return defaultVersionManager.versionToBranchName(version);
}

export function branchNameToVersion(branchName) {
  return defaultVersionManager.branchNameToVersion(branchName);
}

export function loadVersionHistory({ owner, repo }) {
  return defaultVersionManager.loadHistory({ owner, repo });
}

function compareNewestFirst(a, b) {
  if (a.committedAt && b.committedAt) {
    return b.committedAt.localeCompare(a.committedAt);
  }

  return b.branch.localeCompare(a.branch);
}

function buildPagesUrl(owner, repo, branch) {
  return (
    "https://" + owner + ".github.io/" + repo + "/" + branch.replace(/\//g, "-") + "/"
  );
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
