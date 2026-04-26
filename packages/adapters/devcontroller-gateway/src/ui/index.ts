import type { TranscriptEntry } from "@stapleai/adapter-utils";

export const parseStdoutEvent = (
  line: string,
  ts: string
): TranscriptEntry[] => {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[devcontroller]")) {
    const text = trimmed.slice("[devcontroller]".length).trim();

    if (
      text.startsWith("iteration=") ||
      text.startsWith("Loop ") ||
      text.startsWith("Tasks:")
    ) {
      return [{ kind: "system", ts, text }];
    }

    if (text.startsWith("error:")) {
      return [{ kind: "stderr", ts, text }];
    }

    return [{ kind: "stdout", ts, text }];
  }

  return [{ kind: "stdout", ts, text: trimmed }];
};
