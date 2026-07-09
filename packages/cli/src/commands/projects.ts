import { render } from "ink";
import React from "react";
import { ProjectsApp } from "../tui/projects/ProjectsApp.js";

export async function projectsCommand(options: { cwd: string }): Promise<void> {
  // Render TUI on stderr so stdout stays clean for shell function: tz() { cd "$(terminuz projects)"; }
  const { waitUntilExit } = render(React.createElement(ProjectsApp, { cwd: options.cwd }), {
    stdout: process.stderr,
    stderr: process.stderr,
  });
  await waitUntilExit();
}
