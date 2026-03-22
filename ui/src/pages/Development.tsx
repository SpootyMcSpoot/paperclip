import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";

type ViewMode = "editor" | "diff" | "output";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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
      content: "Hello! I'm here to help with your development tasks. You can ask me to generate code, explain concepts, or help debug issues.",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Development Workspace" }]);
  }, [setBreadcrumbs]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  const handleRunCode = () => {
    setOutput(`Running code...\n\n${code}\n\n[Output would appear here in a real execution environment]`);
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

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput,
      timestamp: new Date(),
    };

    setChatMessages([...chatMessages, userMessage]);
    setChatInput("");

    // Simulate agent response
    setTimeout(() => {
      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I've received your message. In a real implementation, this would connect to the AI agent orchestrator.",
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, agentMessage]);
    }, 1000);
  };

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
              <pre className="text-foreground whitespace-pre-wrap">{output || "No output yet. Run your code to see results."}</pre>
            </div>
          )}
        </div>

        {/* Right Panel - Agent Chat */}
        <div className="w-96 flex flex-col bg-card">
          {/* Chat Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Agent Chat</span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col gap-1",
                  message.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {message.content}
                </div>
                <span className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
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
                className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button size="sm" onClick={handleSendMessage}>
                Send
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
