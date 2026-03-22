import { useEffect, useState, useRef, useCallback } from "react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "../context/ThemeContext";
import {
  Code2,
  MessageSquare,
  Terminal,
  GitCompare,
  Play,
  Save,
  Copy,
  Check,
  Square,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";

type ViewMode = "editor" | "diff" | "output";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ModelInfo {
  id: string;
  name: string;
}

export function Development() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [code, setCode] = useState<string>(`// Welcome to the Development Workspace
// This is a lightweight VSCode-like environment for working with AI agents

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("Developer"));
`);
  const [originalCode, setOriginalCode] = useState<string>(code);
  const [output, setOutput] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I can help with your development tasks. Ask me to generate code, explain concepts, or debug issues. I have access to the code in the editor as context.",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen35-coder");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Development Workspace" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    fetch("/api/chat/models")
      .then((res) => res.json())
      .then((data: { models: ModelInfo[]; default?: string }) => {
        if (data.models?.length > 0) {
          setModels(data.models);
          if (data.default) setSelectedModel(data.default);
        }
      })
      .catch(() => {
        setModels([{ id: "qwen35-coder", name: "qwen35-coder" }]);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  const handleRunCode = () => {
    setOutput(
      `Running code...\n\n${code}\n\n[Output would appear here in a real execution environment]`,
    );
    setViewMode("output");
  };

  const handleSaveCode = () => {
    setOriginalCode(code);
    setOutput("Code saved successfully!");
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleStopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput,
      timestamp: new Date(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setChatInput("");
    setIsStreaming(true);

    const systemMessage = {
      role: "system",
      content: `You are a coding assistant in a development workspace. The user has the following code in their editor:\n\n\`\`\`\n${code}\n\`\`\`\n\nHelp them with their development tasks. When generating code, format it in markdown code blocks with the appropriate language tag.`,
    };

    const apiMessages = [
      systemMessage,
      ...chatMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: chatInput },
    ];

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg =
          errorData?.error ?? `Request failed (${response.status})`;
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: `Error: ${errorMsg}` }
              : m,
          ),
        );
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: "Error: No response stream" }
              : m,
          ),
        );
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              accumulated += token;
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: accumulated }
                    : m,
                ),
              );
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      if (!accumulated) {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: "(No response generated)" }
              : m,
          ),
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: m.content || "(Stopped)",
                }
              : m,
          ),
        );
      } else {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
                }
              : m,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, [chatInput, isStreaming, code, chatMessages, selectedModel]);

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-1 flex-1">
          <Button
            variant={viewMode === "editor" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("editor")}
          >
            <Code2 className="h-4 w-4 mr-2" />
            Editor
          </Button>
          <Button
            variant={viewMode === "diff" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("diff")}
          >
            <GitCompare className="h-4 w-4 mr-2" />
            Diff
          </Button>
          <Button
            variant={viewMode === "output" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("output")}
          >
            <Terminal className="h-4 w-4 mr-2" />
            Output
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopyCode}>
            {isCopied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSaveCode}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button variant="default" size="sm" onClick={handleRunCode}>
            <Play className="h-4 w-4 mr-2" />
            Run
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Editor/Diff/Output */}
        <div className="flex-1 min-w-0 border-r border-border">
          {viewMode === "editor" && (
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme={theme === "dark" ? "vs-dark" : "light"}
              value={code}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          )}

          {viewMode === "diff" && (
            <DiffEditor
              height="100%"
              language="typescript"
              theme={theme === "dark" ? "vs-dark" : "light"}
              original={originalCode}
              modified={code}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: true,
              }}
            />
          )}

          {viewMode === "output" && (
            <div className="h-full overflow-auto p-4 font-mono text-sm bg-muted/30">
              <pre className="text-foreground whitespace-pre-wrap">
                {output || "No output yet. Run your code to see results."}
              </pre>
            </div>
          )}
        </div>

        {/* Right Panel - Agent Chat */}
        <div className="w-96 flex flex-col bg-card">
          {/* Chat Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium flex-1">Agent Chat</span>
            {/* Model Selector */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors"
              >
                <span className="max-w-[100px] truncate">
                  {selectedModel}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showModelDropdown && models.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-border bg-popover shadow-md">
                  {models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                        model.id === selectedModel &&
                          "bg-muted font-medium",
                      )}
                    >
                      {model.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col gap-1",
                  message.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {message.content ||
                    (isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask the agent for help..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isStreaming}
                className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              {isStreaming ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopStreaming}
                >
                  <Square className="h-3 w-3 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={handleSendMessage}>
                  Send
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Press Enter to send. Model: {selectedModel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
