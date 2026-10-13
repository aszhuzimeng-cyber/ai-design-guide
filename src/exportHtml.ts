import { resolveProjectPageLabel, slugifyPageLabel } from "./catalog";
import type { ProjectState } from "./types";

export function downloadProjectHtml(project: ProjectState) {
  const html = project.ai?.generatedHtml?.trim();
  if (!html) return false;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugifyPageLabel(resolveProjectPageLabel(project))}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
