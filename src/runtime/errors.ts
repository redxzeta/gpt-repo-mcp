export type RepoReaderErrorCode =
  | "UNKNOWN_REPO"
  | "ABSOLUTE_PATH_REJECTED"
  | "PATH_TRAVERSAL_REJECTED"
  | "SYMLINK_ESCAPE_REJECTED"
  | "UNSUPPORTED_FILE_TYPE"
  | "BINARY_FILE_REJECTED"
  | "SECRET_CANDIDATE_BLOCKED"
  | "DEFAULT_EXCLUDE_BLOCKED"
  | "SIZE_LIMIT_EXCEEDED"
  | "WRITE_DISABLED"
  | "WRITE_DENIED_GLOB"
  | "WRITE_NOT_ALLOWED_GLOB"
  | "WRITE_EXPECTED_SHA_REQUIRED"
  | "WRITE_STALE_EXPECTED_SHA"
  | "WRITE_PARENT_MISSING"
  | "WRITE_TARGET_EXISTS"
  | "WRITE_TARGET_MISSING"
  | "WRITE_CONTENT_REQUIRED"
  | "WRITE_FIND_REQUIRED"
  | "WRITE_FIND_NOT_FOUND"
  | "WRITE_FIND_NOT_UNIQUE"
  | "OPERATIONS_DISABLED"
  | "GIT_STAGE_DISABLED"
  | "GIT_COMMIT_DISABLED"
  | "GIT_HEAD_MISMATCH"
  | "GIT_OPERATION_PATHS_REQUIRED"
  | "GIT_OPERATION_TOO_MANY_PATHS"
  | "GIT_OPERATION_UNSAFE_PATHSPEC"
  | "GIT_STAGED_PATHS_MISMATCH"
  | "GIT_NOTHING_STAGED"
  | "GIT_COMMIT_MESSAGE_INVALID"
  | "CLEANUP_DISABLED"
  | "CLEANUP_PATHS_REQUIRED"
  | "CLEANUP_UNSAFE_PATH"
  | "CLEANUP_TRACKED_PATH"
  | "CLEANUP_NOT_ALLOWED_GLOB"
  | "ACTION_NOT_FOUND"
  | "ACTION_DISABLED"
  | "ACTION_RUN_FAILED"
  | "ACTION_CANCEL_FAILED"
  | "CREATE_PATH_EXISTS"
  | "CREATE_PATH_DENIED"
  | "CREATE_BATCH_TOO_LARGE"
  | "CREATE_CONTENT_TOO_LARGE"
  | "PATCH_FAILED"
  | "PATCH_REJECTED"
  | "GH_PR_CREATE_FAILED"
  | "GH_ISSUE_READ_FAILED"
  | "GH_PR_LIST_FAILED"
  | "GH_PR_READ_FAILED"
  | "GH_PR_CHECKS_FAILED"
  | "GH_PROJECT_LIST_FAILED"
  | "GH_PROJECT_READ_FAILED"
  | "GH_PROJECT_CREATE_FAILED"
  | "GH_PROJECT_ITEM_LIST_FAILED"
  | "GH_PROJECT_ITEM_ADD_FAILED"
  | "GH_MILESTONE_LIST_FAILED"
  | "GH_MILESTONE_READ_FAILED"
  | "GH_MILESTONE_CREATE_FAILED"
  | "GH_ISSUES_READ_DISABLED"
  | "GH_ISSUES_CREATE_DISABLED"
  | "GH_ISSUES_EDIT_DISABLED"
  | "GH_ISSUES_DELETE_DISABLED"
  | "GH_ISSUES_COMMENT_DISABLED"
  | "GH_LABELS_READ_DISABLED"
  | "GH_LABELS_CREATE_DISABLED"
  | "GH_ISSUE_EDIT_FAILED"
  | "GH_ISSUE_DELETE_FAILED"
  | "GH_LABEL_CREATE_FAILED"
  | "GH_LABEL_LIST_FAILED"
  | "GH_ISSUE_CREATE_FAILED"
  | "GH_ISSUE_COMMENT_FAILED"
  | "GH_PR_COMMENT_FAILED"
  | "GH_UNAVAILABLE"
  | "GH_AUTH_FAILED"
  | "GH_RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "GIT_ERROR"
  | "INTERNAL_ERROR";

export class RepoReaderError extends Error {
  readonly code: RepoReaderErrorCode;
  readonly retryable: boolean;
  readonly diagnostics: Record<string, unknown>;

  constructor(
    code: RepoReaderErrorCode,
    message: string,
    options: { retryable?: boolean; diagnostics?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = "RepoReaderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.diagnostics = options.diagnostics ?? {};
  }
}

export function toRepoReaderError(error: unknown): RepoReaderError {
  if (error instanceof RepoReaderError) {
    return error;
  }
  if (error instanceof Error) {
    return new RepoReaderError("INTERNAL_ERROR", error.message);
  }
  return new RepoReaderError("INTERNAL_ERROR", "Unexpected internal error");
}
