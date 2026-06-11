class PagesUrlResolver {
  constructor(strategies = [new VersionBranchPagesUrlStrategy(), new DefaultBranchPagesUrlStrategy()]) {
    this.strategies = strategies;
  }

  resolve({ owner, repo, branch }) {
    const strategy = this.strategies.find(function (candidate) {
      return candidate.supports(branch);
    });

    return strategy.createUrl({ owner, repo, branch });
  }
}

class VersionBranchPagesUrlStrategy {
  supports(branch) {
    return String(branch || "").startsWith("version/");
  }

  createUrl({ owner, repo, branch }) {
    return createBasePagesUrl(owner, repo) + branch.replace(/\//g, "-") + "/";
  }
}

class DefaultBranchPagesUrlStrategy {
  supports() {
    return true;
  }

  createUrl({ owner, repo }) {
    return createBasePagesUrl(owner, repo);
  }
}

function createBasePagesUrl(owner, repo) {
  return "https://" + owner + ".github.io/" + repo + "/";
}

module.exports = {
  DefaultBranchPagesUrlStrategy,
  PagesUrlResolver,
  VersionBranchPagesUrlStrategy
};
