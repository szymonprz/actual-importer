/**
 * An expected failure the user can fix (bad input, missing config). The CLI
 * prints just the message and exits with `exitCode`; any other error is
 * treated as unexpected.
 */
export class UserError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = "UserError";
  }
}
