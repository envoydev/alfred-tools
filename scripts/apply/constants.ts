// The named values apply/ reads.

// A .gitignore that keeps everything in its folder out of git.
export const GITIGNORE_ALL = '*\n';
// How long one runtime fetch (npm, uvx, docker) may run: a first download can take minutes.
export const FETCH_LIMIT_MS = 1800000;
// How long a server stopped with SIGTERM gets before SIGKILL.
export const KILL_AFTER_MS = 5000;
