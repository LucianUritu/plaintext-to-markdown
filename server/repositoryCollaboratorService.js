const DEFAULT_REPOSITORY_COLLABORATORS = [
  {
    username: "LucianUritu",
    permission: "maintain"
  }
];

class RepositoryCollaboratorService {
  constructor({ githubClient, collaborators = DEFAULT_REPOSITORY_COLLABORATORS }) {
    this.githubClient = githubClient;
    this.collaborators = collaborators;
  }

  async inviteDefaultCollaborators({ owner, repo }) {
    const invitations = [];

    for (const collaborator of this.collaborators) {
      invitations.push(
        await this.inviteCollaborator({
          owner,
          repo,
          username: collaborator.username,
          permission: collaborator.permission
        })
      );
    }

    return invitations;
  }

  async inviteCollaborator({ owner, repo, username, permission }) {
    if (typeof this.githubClient.inviteRepositoryCollaborator !== "function") {
      return {
        username,
        permission,
        status: "skipped",
        error: "GitHub collaborator invitations are not available."
      };
    }

    try {
      const result = await this.githubClient.inviteRepositoryCollaborator({
        owner,
        repo,
        username,
        permission
      });

      return {
        username,
        permission,
        status: result.status
      };
    } catch (error) {
      return {
        username,
        permission,
        status: "failed",
        error: error.message
      };
    }
  }
}

module.exports = {
  DEFAULT_REPOSITORY_COLLABORATORS,
  RepositoryCollaboratorService
};
