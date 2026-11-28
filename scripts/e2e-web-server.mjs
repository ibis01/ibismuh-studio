// The E2E harness's own web-server wrapper (Phase 1.4 log contract).
//
// Playwright's webServer previously ran `npm run dev` with its output
// going nowhere in particular — the server-side evidence (the exact
// Prisma FK noise, uncaught exceptions, unexplained 5xx responses) was
// invisible to the suite. This wrapper owns the harness server and TEES
// its combined stdout+stderr into a log file the log-contract
// classifier (scripts/classify-e2e-server-log.mjs) reads at teardown.
//
// Why a wrapper and not `sh -c 'npm run dev | tee file'`: the wrapper is
// cross-platform, forwards termination signals to the child, and keeps
// the child's output visible on the console for start-failure debugging.
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

const LOG = process.env.E2E_SERVER_LOG || "test-results/e2e-server.log";
mkdirSync(dirname(LOG), { recursive: true });

// Fresh log per run — a stale previous run's lines must never dilute the
// contract verdict for THIS run.
const stream = createWriteStream(LOG, { flags: "w" });

const child = spawn("npm", ["run", "dev"], {
  shell: process.platform === "win32",
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

const tee = (src) => {
  src.setEncoding("utf8");
  src.on("data", (chunk) => {
    stream.write(chunk);
    process.stdout.write(chunk);
  });
};
tee(child.stdout);
tee(child.stderr);

const forward = (sig) => {
  const handler = () => {
    try {
      child.kill(sig);
    } catch {
      /* child already gone */
    }
  };
  process.on(sig, handler);
};
forward("SIGTERM");
forward("SIGINT");

child.on("error", (err) => {
  stream.write(`[e2e-web-server] spawn error: ${err?.message ?? err}\n`);
  stream.end();
  process.exit(1);
});
child.on("exit", (code) => {
  stream.end();
  process.exit(code ?? 0);
});
