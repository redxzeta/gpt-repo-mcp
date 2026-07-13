import { DEFAULT_GITHUB_POLICY } from "../policies/github-defaults.js";
import { RepoReaderError } from "../runtime/errors.js";

export type GitHubPolicyConfig = {
  issues_read?: boolean;
  issues_create?: boolean;
  issues_edit?: boolean;
  issues_delete?: boolean;
  issues_comment?: boolean;
  labels_read?: boolean;
  labels_create?: boolean;
};

export type EffectiveGitHubPolicy = {
  issues_read: boolean;
  issues_create: boolean;
  issues_edit: boolean;
  issues_delete: boolean;
  issues_comment: boolean;
  labels_read: boolean;
  labels_create: boolean;
};

export class GitHubPolicy {
  readonly config: EffectiveGitHubPolicy;

  constructor(config: GitHubPolicyConfig = {}) {
    this.config = {
      issues_read: config.issues_read ?? DEFAULT_GITHUB_POLICY.issues_read,
      issues_create: config.issues_create ?? DEFAULT_GITHUB_POLICY.issues_create,
      issues_edit: config.issues_edit ?? DEFAULT_GITHUB_POLICY.issues_edit,
      issues_delete: config.issues_delete ?? DEFAULT_GITHUB_POLICY.issues_delete,
      issues_comment: config.issues_comment ?? DEFAULT_GITHUB_POLICY.issues_comment,
      labels_read: config.labels_read ?? DEFAULT_GITHUB_POLICY.labels_read,
      labels_create: config.labels_create ?? DEFAULT_GITHUB_POLICY.labels_create
    };
  }

  assertIssuesReadAllowed(): void {
    if (!this.config.issues_read) {
      throw new RepoReaderError("GH_ISSUES_READ_DISABLED", "GitHub issue read access is disabled for this repository. Enable github.issues_read in the repository policy.");
    }
  }

  assertIssuesCreateAllowed(): void {
    if (!this.config.issues_create) {
      throw new RepoReaderError("GH_ISSUES_CREATE_DISABLED", "GitHub issue creation is disabled for this repository. Enable github.issues_create in the repository policy.");
    }
  }

  assertIssuesEditAllowed(): void {
    if (!this.config.issues_edit) {
      throw new RepoReaderError("GH_ISSUES_EDIT_DISABLED", "GitHub issue editing is disabled for this repository. Enable github.issues_edit in the repository policy.");
    }
  }

  assertIssuesDeleteAllowed(): void {
    if (!this.config.issues_delete) {
      throw new RepoReaderError("GH_ISSUES_DELETE_DISABLED", "GitHub issue deletion is disabled for this repository. Enable github.issues_delete in the repository policy.");
    }
  }

  assertIssuesCommentAllowed(): void {
    if (!this.config.issues_comment) {
      throw new RepoReaderError("GH_ISSUES_COMMENT_DISABLED", "GitHub issue commenting is disabled for this repository. Enable github.issues_comment in the repository policy.");
    }
  }

  assertLabelsReadAllowed(): void {
    if (!this.config.labels_read) {
      throw new RepoReaderError("GH_LABELS_READ_DISABLED", "GitHub label read access is disabled for this repository. Enable github.labels_read in the repository policy.");
    }
  }

  assertLabelsCreateAllowed(): void {
    if (!this.config.labels_create) {
      throw new RepoReaderError("GH_LABELS_CREATE_DISABLED", "GitHub label creation is disabled for this repository. Enable github.labels_create in the repository policy.");
    }
  }
}
