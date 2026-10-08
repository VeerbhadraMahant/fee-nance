/**
 * Only same-site relative paths are allowed as a post-login destination.
 * "//evil.com" and "/\\evil.com" are protocol-relative to a browser, so they
 * are rejected along with absolute URLs — an open redirect otherwise.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
