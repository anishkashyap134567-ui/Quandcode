import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

export interface WorktreeJob {
  id: string;
  task: string;
  path: string;
  branch: string;
  status: "running" | "completed" | "failed";
  logFile: string;
  pid?: number;
}

export class WorktreeManager {
  private static jobs = new Map<string, WorktreeJob>();

  static list(): WorktreeJob[] {
    return Array.from(this.jobs.values());
  }

  static get(id: string): WorktreeJob | undefined {
    return this.jobs.get(id);
  }

  static async create(task: string, model: string, provider: string): Promise<WorktreeJob> {
    const id = `wt_${Date.now().toString(36)}`;
    const branch = `quandcode-${id}`;
    const rootDir = process.cwd();
    const wtPath = path.join(rootDir, ".quandcode", "worktrees", id);
    const logFile = path.join(rootDir, ".quandcode", "worktrees", `${id}.log`);

    // Ensure the worktrees parent directory exists
    fs.mkdirSync(path.join(rootDir, ".quandcode", "worktrees"), { recursive: true });

    // Step 1: Create a git branch from current HEAD
    execSync(`git branch ${branch}`, { stdio: "ignore" });

    // Step 2: Add git worktree
    execSync(`git worktree add "${wtPath}" ${branch}`, { stdio: "ignore" });

    const job: WorktreeJob = {
      id,
      task,
      path: wtPath,
      branch,
      status: "running",
      logFile,
    };
    this.jobs.set(id, job);

    // Step 3: Spawn the agent in the background inside the worktree directory!
    const logStream = fs.createWriteStream(logFile);
    logStream.write(`=== QuandCode Parallel Subagent Started ===\n`);
    logStream.write(`Task ID: ${id}\n`);
    logStream.write(`Task: ${task}\n`);
    logStream.write(`Path: ${wtPath}\n\n`);

    // Run bun packages/core/src/cli/index.ts run -p "<task>" --model <model> --provider <provider> --yes
    const child = spawn("bun", [
      "run",
      path.join(rootDir, "packages/core/src/cli/index.ts"),
      "run",
      "-p",
      task,
      "--model",
      model,
      "--provider",
      provider,
      "--yes"
    ], {
      cwd: wtPath,
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    job.pid = child.pid;

    child.stdout.on("data", (data) => {
      logStream.write(data);
    });

    child.stderr.on("data", (data) => {
      logStream.write(data);
    });

    child.on("close", (code) => {
      job.status = code === 0 ? "completed" : "failed";
      logStream.write(`\n=== Job Finished with code ${code} ===\n`);
      logStream.end();

      // Commit changes if completed successfully!
      if (code === 0) {
        try {
          execSync(`git -C "${wtPath}" add .`, { stdio: "ignore" });
          execSync(`git -C "${wtPath}" commit -m "feat(subagent): ${task}"`, { stdio: "ignore" });
        } catch {}
      }
    });

    return job;
  }

  static cleanup(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    try {
      execSync(`git worktree remove --force "${job.path}"`, { stdio: "ignore" });
      execSync(`git branch -D ${job.branch}`, { stdio: "ignore" });
    } catch {}

    this.jobs.delete(id);
  }
}
