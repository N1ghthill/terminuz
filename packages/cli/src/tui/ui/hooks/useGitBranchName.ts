import { useState, useEffect, useCallback } from "react";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

function gitExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString().trim());
    });
  });
}

export function useGitBranchName(cwd: string): string | undefined {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);

  const fetchBranchName = useCallback(async () => {
    try {
      const branch = await gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (branch && branch !== "HEAD") {
        setBranchName(branch);
      } else {
        const hash = await gitExec(["rev-parse", "--short", "HEAD"], cwd);
        setBranchName(hash || undefined);
      }
    } catch {
      setBranchName(undefined);
    }
  }, [cwd]);

  useEffect(() => {
    void fetchBranchName();

    const gitLogsHeadPath = path.join(cwd, ".git", "logs", "HEAD");
    let watcher: fs.FSWatcher | undefined;

    void fsPromises
      .access(gitLogsHeadPath, fs.constants.F_OK)
      .then(() => {
        watcher = fs.watch(gitLogsHeadPath, (eventType) => {
          if (eventType === "change" || eventType === "rename") {
            void fetchBranchName();
          }
        });
      })
      .catch(() => {});

    return () => {
      watcher?.close();
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
