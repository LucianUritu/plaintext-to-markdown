const { PagesUrlResolver } = require("./publishingTargets");

class VersioningService {
  constructor(githubClient, { pagesUrlResolver = new PagesUrlResolver(), prefix = "version/" } = {}) {
    this.githubClient = githubClient;
    this.pagesUrlResolver = pagesUrlResolver;
    this.prefix = prefix;
  }

  async listVersionBranches({ owner, repo, perPage }) {
    const branches = await this.githubClient.listBranches({
      owner,
      repo,
      prefix: this.prefix,
      perPage
    });

    return branches.map((branch) => ({
      ...branch,
      version: this.toVersionLabel(branch.name),
      pagesUrl: this.pagesUrlResolver.resolve({
        owner,
        repo,
        branch: branch.name
      })
    }));
  }

  getCommit({ owner, repo, sha }) {
    return this.githubClient.getCommitBySha({ owner, repo, sha });
  }

  toVersionLabel(branchName) {
    const branch = String(branchName || "");

    if (!branch.startsWith(this.prefix)) {
      return branch;
    }

    return branch.slice(this.prefix.length);
  }
}

module.exports = {
  VersioningService
};
