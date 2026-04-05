import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export const parseStdoutEvent = (
  line: string,
  ts: string
): TranscriptEntry[] => {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[libai]")) {
    const text = trimmed.slice("[libai]".length).trim();
    return [{ kind: "system", ts, text }];
  }

  return [{ kind: "assistant", ts, text: trimmed, delta: false }];
};
