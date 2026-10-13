function extractJsonCandidate(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function closeOpenJsonBrackets(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") stack.pop();
  }

  let result = text.trimEnd().replace(/,\s*$/, "");
  if (inString) {
    result += '"';
  }
  while (stack.length) {
    result += stack.pop();
  }
  return result;
}

function salvageTruncatedJson(text: string): string | null {
  let slice = text.trimEnd();
  for (let attempt = 0; attempt < 48; attempt += 1) {
    slice = slice
      .replace(/,\s*$/, "")
      .replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/u, "")
      .replace(/,\s*"[^"]*"\s*:\s*\{[^}]*$/u, "")
      .replace(/,\s*"[^"]*"\s*:\s*\[[^\]]*$/u, "")
      .replace(/,\s*\{[^}]*$/u, "")
      .replace(/,\s*\[[^\]]*$/u, "");

    const closed = closeOpenJsonBrackets(slice);
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      const lastComma = Math.max(closed.lastIndexOf(","), closed.lastIndexOf("["), closed.lastIndexOf("{"));
      if (lastComma <= 0) break;
      slice = closed.slice(0, lastComma);
    }
  }
  return null;
}

export function extractJsonObject<T>(content: string): T {
  const candidate = extractJsonCandidate(content);
  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new Error("AI response did not contain a JSON object");
  }

  const fromStart = candidate.slice(start);
  const attempts = [
    fromStart,
    candidate.slice(start, candidate.lastIndexOf("}") + 1),
  ].filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const repaired = salvageTruncatedJson(fromStart);
  if (repaired) {
    try {
      return JSON.parse(repaired) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Invalid JSON";
  throw new Error(message);
}

function extractBalancedJsonValue(text: string, startIndex: number): string | null {
  const open = text[startIndex];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return closeOpenJsonBrackets(text.slice(startIndex));
}

export function extractVisualGrammarPayload<T extends { visualSelections?: Record<string, unknown> }>(content: string): T {
  try {
    return extractJsonObject<T>(content);
  } catch (primaryError) {
    const candidate = extractJsonCandidate(content);
    const visualSelections: Record<string, unknown> = {};
    for (const dimensionId of ["color", "font", "card", "density"]) {
      const marker = `"${dimensionId}"`;
      const markerIndex = candidate.indexOf(marker);
      if (markerIndex < 0) continue;
      const colonIndex = candidate.indexOf(":", markerIndex + marker.length);
      if (colonIndex < 0) continue;
      let cursor = colonIndex + 1;
      while (cursor < candidate.length && /\s/.test(candidate[cursor])) cursor += 1;
      if (candidate[cursor] !== "{") continue;
      const raw = extractBalancedJsonValue(candidate, cursor);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { options?: unknown[] };
        if (Array.isArray(parsed.options) && parsed.options.length > 0) {
          visualSelections[dimensionId] = parsed;
        }
      } catch {
        // try next dimension
      }
    }
    if (Object.keys(visualSelections).length > 0) {
      return { visualSelections } as T;
    }
    throw primaryError;
  }
}
