import { useState, useEffect } from 'react';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { useConfig } from '../contexts/ConfigContext.js';

export interface UseStatusLineReturn {
  lines: string[];
}

const GIT_POLL_INTERVAL_MS = 30_000;

export function useStatusLine(): UseStatusLineReturn {
  const config = useConfig();
  const cwd = config.getWorkingDir();
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    function poll() {
      execFile('git', ['branch', '--show-current'], { cwd }, (err, stdout) => {
        if (alive) setBranch(err ? null : stdout.trim() || null);
      });
    }

    poll();
    const timer = setInterval(poll, GIT_POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [cwd]);

  if (!branch) return { lines: [] };

  const home = os.homedir();
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return { lines: [`${displayCwd} [${branch}]`] };
}
