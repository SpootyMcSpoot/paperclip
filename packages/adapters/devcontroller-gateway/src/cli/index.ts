import type { CLIAdapterModule } from "@paperclipai/adapter-utils";

export const adapter: CLIAdapterModule = {
  type: "devcontroller_gateway",
  formatStdoutEvent: (line: string, _debug: boolean) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    console.log(trimmed);
  },
};
