import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Briefcase,
  Compass,
  ExternalLink,
  FileText,
  Link2,

  Lock,
  Quote,
  RefreshCw,
  Sparkles as SparklesIcon,
  Upload,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UnlockDialog } from "@/components/navi/UnlockDialog";


import naviLogo from "@/assets/navi-logo.png";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";
import { naviChat } from "@/lib/navi.functions";
import { extractPdfText } from "@/lib/pdf-parse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Navi — your AI career coach" },
      {
        name: "description",
        content:
          "Upload your resume and get 3 ranked career paths plus a 12-week roadmap, grounded in your real experience.",
      },
      { property: "og:title", content: "Navi — your AI career coach" },
      {
        property: "og:description",
        content: "Resume-grounded career paths and a 12-week roadmap.",
      },
    ],
  }),
  component: NaviApp,
});

type AppState = "IDLE" | "PARSING" | "CONTEXT" | "ANALYZING" | "CHAT";

type ChatMsg = { role: "user" | "assistant"; content: string };

type PathCard = {
  role: string;
  why_it_fits: string;
  salary_from: string;
  salary_to: string;
  upskills: string[];
  difficulty: 1 | 2 | 3;
  difficulty_label: string;
  timeline: string;
};

type PathsPayload = {
  type: "paths";
  intro: string;
  paths: PathCard[];
  closing_note?: string;
};

type RoadmapWeek = {
  fortnight: string;
  focus: string;
  resource: string;
  action: string;
  job_to_bookmark: string;
};

type RoadmapPayload = {
  type: "roadmap";
  role: string;
  total_weeks?: number;
  milestone_cadence?: string;
  thirty_day_milestone: string;
  weeks: RoadmapWeek[];
};

type ClosePayload = { type: "close"; message: string };

type RenderedMsg =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "paths"; data: PathsPayload }
  | { id: string; role: "assistant"; kind: "roadmap"; data: RoadmapPayload }
  | { id: string; role: "assistant"; kind: "close"; data: ClosePayload };

const PARSE_STEPS = [
  "Extracting experience",
  "Understanding trajectory",
  "Spotting strengths & gaps",
  "Crafting first insight",
];

const newId = () => Math.random().toString(36).slice(2);

function NaviApp() {
  const [state, setState] = useState<AppState>("IDLE");
  const [resumeText, setResumeText] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const [ctx, setCtx] = useState<{ relocate?: string; budget?: string; timeline?: string }>({});
  const [messages, setMessages] = useState<RenderedMsg[]>([]);
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [previousRoles, setPreviousRoles] = useState<string[]>([]);
  const [roundsShown, setRoundsShown] = useState(0);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseStep, setParseStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("isNaviAuthenticated") === "true";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("isNaviAuthenticated", isAuthenticated ? "true" : "false");
  }, [isAuthenticated]);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const hasAutoPromptedGate = useRef(false);

  // Value-first gate: auto-open the unlock modal as soon as the AI's first
  // personalized insight is rendered. Only fires once per session.
  useEffect(() => {
    if (
      !isAuthenticated &&
      !hasAutoPromptedGate.current &&
      messages.some((m) => m.role === "assistant")
    ) {
      hasAutoPromptedGate.current = true;
      setUnlockOpen(true);
    }
  }, [messages, isAuthenticated]);

  const callNavi = useServerFn(naviChat);


  // Stepper animation during PARSING/ANALYZING
  useEffect(() => {
    if (state !== "PARSING" && state !== "ANALYZING") return;
    setParseStep(0);
    const interval = setInterval(() => {
      setParseStep((s) => (s < 3 ? s + 1 : s));
    }, 900);
    return () => clearInterval(interval);
  }, [state]);

  const startAnalysis = useCallback(
    async (resume: string, contextInputs: typeof ctx) => {
      setState("ANALYZING");
      setError(null);
      try {
        const res = await callNavi({
          data: {
            resumeText: resume,
            context: contextInputs,
            history: [],
            previousRoles: [],
            roundsShown: 0,
          },
        });
        const intro: RenderedMsg = {
          id: newId(),
          role: "assistant",
          kind: "text",
          text: res.text,
        };
        setMessages([intro]);
        setHistory([{ role: "assistant", content: res.text }]);
        setState("CHAT");
      } catch (e) {
        setError(messageFromError(e));
        setState("CONTEXT");
      }
    },
    [callNavi],
  );

  const handleFile = async (file: File) => {
    setParseError(null);
    setState("PARSING");
    try {
      const text = await extractPdfText(file);
      if (!text || text.trim().length < 80) throw new Error("PDF_NO_TEXT");
      setResumeText(text);
      setState("CONTEXT");
    } catch (e) {
      console.warn("[navi] PDF parse failed:", e);
      setParseError(
        "I couldn't quite read the text in that PDF (it might be a scan or have complex formatting). Let's do this the quick way — could you copy-paste your key experience below?",
      );
      setShowManual(true);
      setState("IDLE");
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const skipContext = () => void startAnalysis(resumeText, {});
  const submitContext = () => void startAnalysis(resumeText, ctx);

  const sendMessage = async (text: string) => {
    if (!text.trim() || thinking) return;
    const userMsg: RenderedMsg = { id: newId(), role: "user", kind: "text", text };
    const newHistory: ChatMsg[] = [...history, { role: "user", content: text }];
    setMessages((m) => [...m, userMsg]);
    setHistory(newHistory);
    setInput("");
    setThinking(true);
    setError(null);
    try {
      const res = await callNavi({
        data: {
          resumeText,
          context: ctx,
          history: newHistory,
          previousRoles,
          roundsShown,
        },
      });
      handleAssistantResponse(res, newHistory);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setThinking(false);
    }
  };

  const handleAssistantResponse = (
    res: Awaited<ReturnType<typeof naviChat>>,
    baseHistory: ChatMsg[],
  ) => {
    if (res.kind === "structured") {
      try {
        const parsed = JSON.parse(res.json) as PathsPayload | RoadmapPayload | ClosePayload;
        if (parsed.type === "paths") {
          setMessages((m) => [
            ...m,
            { id: newId(), role: "assistant", kind: "paths", data: parsed },
          ]);
          setPreviousRoles((p) => [...p, ...(parsed.paths?.map((x) => x.role) ?? [])]);
          setRoundsShown((r) => r + 1);
        } else if (parsed.type === "roadmap") {
          setMessages((m) => [
            ...m,
            { id: newId(), role: "assistant", kind: "roadmap", data: parsed },
          ]);
        } else if (parsed.type === "close") {
          setMessages((m) => [
            ...m,
            { id: newId(), role: "assistant", kind: "close", data: parsed },
          ]);
        }
        setHistory([...baseHistory, { role: "assistant", content: res.text }]);
        return;
      } catch {
        // fall through to text
      }
    }
    setMessages((m) => [
      ...m,
      { id: newId(), role: "assistant", kind: "text", text: res.text },
    ]);
    setHistory([...baseHistory, { role: "assistant", content: res.text }]);
  };

  const requestMorePaths = () =>
    void sendMessage("Show me 3 different paths — different from the ones above.");

  const selectPath = (role: string) => {
    // Value-first: fetch the roadmap regardless of auth.
    // RoadmapView shows only the first fortnight + blurred remainder
    // with an "Unlock full 12-week roadmap" CTA when `unlocked` is false.
    void sendMessage(`I want to explore "${role}". Show me the 12-week roadmap.`);
  };

  const onSubmit = (msg: { text?: string }) => {
    void sendMessage(msg.text ?? input);
  };

  const canRefresh = roundsShown > 0 && roundsShown < 3 && state === "CHAT";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <img src={naviLogo} alt="Navi" className="h-9 w-9" />
          <div className="flex flex-col leading-tight">
            <span className="font-bold tracking-tight text-lg">Navi</span>
            <span className="text-xs text-muted-foreground">A sharper career conversation</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
        {state === "IDLE" && (
          <LandingUpload
            onFile={handleFile}
            parseError={parseError}
            showManual={showManual}
            onManualSubmit={(text) => {
              setResumeText(text);
              setState("CONTEXT");
            }}
          />
        )}

        {(state === "PARSING" || state === "ANALYZING") && (
          <ParseStepper
            step={parseStep}
            preview={state === "ANALYZING" ? resumeText.slice(0, 220) : ""}
            label={state === "PARSING" ? "Reading your resume" : "Crafting your first insight"}
          />
        )}

        {state === "CONTEXT" && (
          <ContextScreen
            value={ctx}
            onChange={setCtx}
            onSubmit={submitContext}
            onSkip={skipContext}
          />
        )}

        {state === "CHAT" && (
          <ChatSurface
            messages={messages}
            thinking={thinking}
            error={error}
            input={input}
            setInput={setInput}
            onSubmit={onSubmit}
            canRefresh={canRefresh}
            roundsShown={roundsShown}
            onRefresh={requestMorePaths}
            onSelectPath={selectPath}
            unlocked={isAuthenticated}
            onSignOut={() => {
              setIsAuthenticated(false);
              localStorage.removeItem("isNaviAuthenticated");
              window.location.reload();
            }}
            onRequestUnlock={() => {
              setUnlockOpen(true);
            }}
          />
        )}
      </main>

      <UnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        onUnlocked={() => {
          setIsAuthenticated(true);
        }}
      />
    </div>
  );
}


function messageFromError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Something went wrong.";
  if (msg.includes("RATE_LIMIT")) return "Navi is getting a lot of requests right now. Try again in a few seconds.";
  if (msg.includes("CREDITS_EXHAUSTED")) return "AI credits exhausted for this workspace. Add credits to continue.";
  return "Navi hit a snag. Try sending that again.";
}

/* ────────────────────────── LANDING / UPLOAD ────────────────────────── */

function LandingUpload({
  onFile,
  parseError,
  showManual,
  onManualSubmit,
}: {
  onFile: (f: File) => void;
  parseError: string | null;
  showManual: boolean;
  onManualSubmit: (text: string) => void;
}) {
  const pdfRef = useRef<HTMLInputElement>(null);
  const liRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");

  const submitPaste = () => {
    const text = paste.trim();
    if (text.length < 60) return;
    onManualSubmit(text);
  };

  return (
    <div className="space-y-8 pt-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">For 1–10 yrs experience</p>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Three paths.
          <br />
          One <span className="text-primary">honest</span> conversation.
        </h1>
        <p className="text-base text-muted-foreground">
          Share your experience. Navi reads it, asks one good question, then shows you 3 career
          paths grounded in your actual background — plus a tailored roadmap.
        </p>
      </div>

      <Tabs defaultValue="pdf" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pdf" className="gap-1.5">
            <Upload className="size-3.5" /> Resume PDF
          </TabsTrigger>
          <TabsTrigger value="linkedin" className="gap-1.5">
            <Link2 className="size-3.5" /> LinkedIn PDF
          </TabsTrigger>
          <TabsTrigger value="paste" className="gap-1.5">
            <FileText className="size-3.5" /> Paste text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pdf" className="mt-4">
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-sm transition hover:border-primary/60">
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Upload className="mx-auto mb-3 size-7 text-primary" />
            <p className="font-semibold">Drop your resume PDF</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Parsed in your browser — never uploaded to a server.
            </p>
            <Button size="lg" onClick={() => pdfRef.current?.click()}>
              Choose PDF
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              💡 Best results from PDFs exported by Google Docs or Word — not scanned images.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="linkedin" className="mt-4">
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-sm transition hover:border-primary/60">
            <input
              ref={liRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Link2 className="mx-auto mb-3 size-7 text-primary" />
            <p className="font-semibold">Upload your LinkedIn PDF</p>
            <p className="mb-4 text-sm text-muted-foreground">
              On LinkedIn: <span className="font-medium">More → Save to PDF</span> from your
              profile, then drop it here.
            </p>
            <Button size="lg" onClick={() => liRef.current?.click()}>
              Choose LinkedIn PDF
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Same parser — your file never leaves the browser.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="paste" className="mt-4">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="font-semibold">Type or paste your experience</p>
            <p className="text-sm text-muted-foreground">
              Roles, companies, years, tech stack, projects, what you want next. The more specific
              the better — Navi will ground every suggestion in what you write here.
            </p>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="e.g. SDE-2 at Razorpay (2.5 yrs). Go + Kafka on the payments team. Before: backend at Swiggy on the logistics squad. B.Tech CS, IIT-BHU 2020. Side project: a Rust-based options analytics tool. Looking to move toward infra / platform or AI-adjacent roles, not pure product."
              maxLength={6000}
              className="min-h-[180px]"
            />
            <Button onClick={submitPaste} disabled={paste.trim().length < 60} className="w-full">
              Continue
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {showManual && <ManualForm onSubmit={onManualSubmit} />}
    </div>
  );
}

function ManualForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [f, setF] = useState({ role: "", company: "", yoe: "", skills: "", target: "" });
  const valid = f.role.trim().length > 1 && f.company.trim().length > 1;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = `Current role: ${f.role}
Company: ${f.company}
Years of experience: ${f.yoe}
Key skills: ${f.skills}
Target role / direction: ${f.target}`;
    onSubmit(text);
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-border bg-card p-5"
    >
      <p className="font-bold tracking-tight text-lg">Tell Navi the basics</p>
      <Field label="Current role" v={f.role} on={(v) => setF({ ...f, role: v })} />
      <Field label="Company" v={f.company} on={(v) => setF({ ...f, company: v })} />
      <Field label="Years of experience" v={f.yoe} on={(v) => setF({ ...f, yoe: v })} />
      <Field label="Key skills (comma-separated)" v={f.skills} on={(v) => setF({ ...f, skills: v })} />
      <Field label="Target role (optional)" v={f.target} on={(v) => setF({ ...f, target: v })} />
      <Button type="submit" disabled={!valid} className="w-full">
        Continue
      </Button>
    </form>
  );
}

function Field({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} maxLength={200} />
    </div>
  );
}

/* ────────────────────────── PARSE STEPPER ────────────────────────── */

function ParseStepper({
  step,
  preview,
  label,
}: {
  step: number;
  preview?: string;
  label: string;
}) {
  return (
    <div className="space-y-8 pt-12">
      <div className="text-center">
        <Compass className="mx-auto mb-3 size-7 animate-pulse text-primary" />
        <Shimmer className="font-bold tracking-tight text-xl">{`${label}…`}</Shimmer>
      </div>
      <ol className="space-y-3">
        {PARSE_STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-all",
              i < step && "opacity-60",
              i === step && "border-primary/60 shadow-sm",
              i > step && "opacity-40",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className="text-sm">{s}</span>
          </li>
        ))}
      </ol>
      {preview && (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <FileText className="mb-1 inline size-3" /> Found: {preview}…
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── CONTEXT SCREEN ────────────────────────── */

function ContextScreen({
  value,
  onChange,
  onSubmit,
  onSkip,
}: {
  value: { relocate?: string; budget?: string; timeline?: string };
  onChange: (v: { relocate?: string; budget?: string; timeline?: string }) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-6 pt-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">30 seconds</p>
        <h2 className="mt-1 font-bold tracking-tight text-2xl">3 quick things before we start</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Helps Navi tailor the paths. All optional.
        </p>
      </div>

      <Group
        label="Open to relocate?"
        options={["Yes", "Remote only", "No"]}
        value={value.relocate}
        on={(v) => onChange({ ...value, relocate: v })}
      />
      <Group
        label="Upskilling budget"
        options={["₹0", "₹5K", "₹20K+"]}
        value={value.budget}
        on={(v) => onChange({ ...value, budget: v })}
      />
      <Group
        label="Timeline"
        options={["Just exploring", "3–6 months", "Urgent"]}
        value={value.timeline}
        on={(v) => onChange({ ...value, timeline: v })}
      />

      <div className="flex gap-2 pt-2">
        <Button onClick={onSubmit} className="flex-1">
          Start the conversation
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function Group({
  label,
  options,
  value,
  on,
}: {
  label: string;
  options: string[];
  value?: string;
  on: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => on(o)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm transition",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────── CHAT SURFACE ────────────────────────── */

function ChatSurface({
  messages,
  thinking,
  error,
  input,
  setInput,
  onSubmit,
  canRefresh,
  roundsShown,
  onRefresh,
  onSelectPath,
  unlocked,
  onSignOut,
  onRequestUnlock,
}: {
  messages: RenderedMsg[];
  thinking: boolean;
  error: string | null;
  input: string;
  setInput: (s: string) => void;
  onSubmit: (msg: { text?: string }) => void;
  canRefresh: boolean;
  roundsShown: number;
  onRefresh: () => void;
  onSelectPath: (role: string) => void;
  unlocked: boolean;
  onSignOut: () => void;
  onRequestUnlock: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!thinking) ref.current?.focus();
  }, [thinking, messages.length]);

  const status = useMemo(() => (thinking ? "submitted" : "ready"), [thinking]);

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      <div className="fixed right-4 top-4 z-50">
        <Button variant="destructive" size="sm" onClick={onSignOut} className="shadow-sm">
          Sign Out
        </Button>
      </div>
      <Conversation className="flex-1">
        <ConversationContent className="space-y-4">
          {messages.map((m) => (
            <RenderMessage
              key={m.id}
              m={m}
              onSelectPath={onSelectPath}
              unlocked={unlocked}
              onRequestUnlock={onRequestUnlock}
            />
          ))}

          {thinking && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer className="text-sm">Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
          {canRefresh && !thinking && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="mr-1.5 size-3" />
                Show me 3 different paths ({3 - roundsShown} left)
              </Button>
            </div>
          )}
          {error && (
            <p className="text-center text-xs text-destructive">{error}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 pt-3">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to Navi…"
            disabled={thinking}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={status as "submitted" | "ready"}
              disabled={thinking || !input.trim()}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function RenderMessage({
  m,
  onSelectPath,
  unlocked,
  onRequestUnlock,
}: {
  m: RenderedMsg;
  onSelectPath: (role: string) => void;
  unlocked: boolean;
  onRequestUnlock: () => void;
}) {
  if (m.role === "user") {
    return (
      <Message from="user">
        <MessageContent>{m.text}</MessageContent>
      </Message>
    );
  }
  if (m.kind === "text") {
    return (
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{m.text}</MessageResponse>
        </MessageContent>
      </Message>
    );
  }
  if (m.kind === "paths") {
    const paths = m.data?.paths ?? [];
    return (
      <Message from="assistant">
        <MessageContent>
          <p className="mb-3 text-sm leading-relaxed">{m.data.intro}</p>
          <div className="space-y-3">
            {paths.map((p, i) => (
              <PathCardView
                key={`${p.role}-${i}`}
                p={p}
                onSelect={() => onSelectPath(p.role)}
              />
            ))}
          </div>
          {m.data.closing_note && (
            <p className="mt-3 text-xs text-muted-foreground">{m.data.closing_note}</p>
          )}
          {!unlocked && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" /> Tap any path to unlock its 12-week roadmap.
            </p>
          )}
        </MessageContent>
      </Message>
    );
  }
  if (m.kind === "roadmap") {
    return (
      <Message from="assistant">
        <MessageContent>
          <RoadmapView r={m.data} unlocked={unlocked} onUnlock={onRequestUnlock} />
        </MessageContent>
      </Message>
    );
  }

  // close
  return (
    <Message from="assistant">
      <MessageContent>
        <div className="rounded-xl border border-primary/30 bg-accent/40 p-4">
          <SparklesIcon className="mb-2 size-4 text-primary" />
          <MessageResponse>{m.data.message}</MessageResponse>
        </div>
      </MessageContent>
    </Message>
  );
}

function PathCardView({ p, onSelect }: { p: PathCard; onSelect: () => void }) {
  const difficultyColor =
    p.difficulty === 1
      ? "bg-[var(--difficulty-easy)]"
      : p.difficulty === 2
        ? "bg-[var(--difficulty-moderate)]"
        : "bg-[var(--difficulty-bold)]";
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-sm"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-bold tracking-tight text-base leading-tight">{p.role}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{p.timeline}</span>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{p.why_it_fits}</p>
      <div className="mb-3 flex items-baseline gap-1.5 text-sm">
        <span className="text-muted-foreground">Salary</span>
        <span className="font-medium">{p.salary_from}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium text-primary">{p.salary_to}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {p.upskills.map((u) => (
          <span
            key={u}
            className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
          >
            {u}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("size-2 rounded-full", difficultyColor)} />
        <span className="text-muted-foreground">{p.difficulty_label}</span>
        <span className="ml-auto text-primary">Tap for roadmap →</span>
      </div>
    </button>
  );
}

function RoadmapView({
  r,
  unlocked,
  onUnlock,
}: {
  r: RoadmapPayload;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const totalWeeks = r.total_weeks ?? r.weeks.length * 2;
  const cadence = r.milestone_cadence ?? "Every 2 weeks";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">
          {totalWeeks}-week roadmap · {cadence}
        </p>
        <h3 className="text-xl font-bold tracking-tight">{r.role}</h3>
      </div>
      <div className="rounded-xl border border-accent bg-accent/40 p-3 text-sm">
        <span className="font-semibold">30-day milestone:</span> {r.thirty_day_milestone}
      </div>

      <Tabs defaultValue="roadmap" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="roadmap" className="gap-1.5 text-xs">
            <Compass className="size-3.5" /> Roadmap
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 text-xs">
            <Briefcase className="size-3.5" /> Jobs
          </TabsTrigger>
          <TabsTrigger value="stories" className="gap-1.5 text-xs">
            <Quote className="size-3.5" /> Stories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roadmap" className="mt-4">
          {unlocked ? (
            <ol className="space-y-3">
              {r.weeks.map((w, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {w.fortnight}
                    </span>
                    <span className="text-xs text-muted-foreground">{w.focus}</span>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Resource: </span>
                    {w.resource}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Action: </span>
                    {w.action}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Bookmark: </span>
                    {w.job_to_bookmark}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="relative">
              <ol
                aria-hidden
                className="pointer-events-none space-y-3 select-none"
                style={{ filter: "blur(4px)" }}
              >
                {r.weeks.slice(0, 4).map((w, i) => (
                  <li key={i} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        {w.fortnight}
                      </span>
                      <span className="text-xs text-muted-foreground">{w.focus}</span>
                    </div>
                    <p className="text-sm">Resource: {w.resource}</p>
                    <p className="mt-1 text-sm">Action: {w.action}</p>
                  </li>
                ))}
              </ol>

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-linear-to-b from-background/40 via-background/80 to-background/95 p-4 text-center">
                <Lock className="size-5 text-primary" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  Your full {totalWeeks}-week plan — every fortnight, every resource, every
                  bookmarkable role — is ready.
                </p>
                <Button size="lg" onClick={onUnlock} className="shadow-md">
                  Unlock full {totalWeeks}-week roadmap
                </Button>
                <p className="text-xs text-muted-foreground">6-digit code by email. No password.</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <JobsTab role={r.role} weeks={r.weeks} unlocked={unlocked} onUnlock={onUnlock} />
        </TabsContent>

        <TabsContent value="stories" className="mt-4">
          <StoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────────────────────── JOBS TAB ────────────────────────── */

const JOB_BOARDS = [
  {
    name: "LinkedIn",
    url: (q: string) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=India`,
  },
  {
    name: "Naukri",
    url: (q: string) =>
      `https://www.naukri.com/${encodeURIComponent(q.toLowerCase().replace(/\s+/g, "-"))}-jobs`,
  },
  {
    name: "Indeed",
    url: (q: string) => `https://in.indeed.com/jobs?q=${encodeURIComponent(q)}`,
  },
];

function inferRelatedRoles(role: string, weeks: RoadmapWeek[]): string[] {
  const fromBookmarks = weeks.map((w) => w.job_to_bookmark).filter(Boolean);
  const seeded = [role, ...fromBookmarks];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of seeded) {
    const key = r.toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
    if (out.length >= 6) break;
  }
  return out;
}

function JobsTab({
  role,
  weeks,
  unlocked,
  onUnlock,
}: {
  role: string;
  weeks: RoadmapWeek[];
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const roles = inferRelatedRoles(role, weeks);
  const salaryRanges: Record<number, string> = {
    0: "₹18L – ₹32L",
    1: "₹14L – ₹26L",
    2: "₹22L – ₹40L",
    3: "₹12L – ₹22L",
    4: "₹16L – ₹28L",
    5: "₹20L – ₹35L",
  };

  const visible = unlocked ? roles : roles.slice(0, 2);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Roles mapped to <span className="font-semibold text-foreground">{role}</span>. Salary bands
        are market estimates for India (1–10 YOE) — search on each board for live listings.
      </p>
      <div className="space-y-2">
        {visible.map((r, i) => (
          <div
            key={`${r}-${i}`}
            className="rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r}</p>
                <p className="text-xs text-muted-foreground">
                  Expected: <span className="font-medium text-foreground">{salaryRanges[i] ?? "₹15L – ₹28L"}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {JOB_BOARDS.map((b) => (
                  <a
                    key={b.name}
                    href={b.url(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary/60 hover:text-primary"
                  >
                    {b.name} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!unlocked && roles.length > 2 && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-accent/30 p-4 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            {roles.length - 2} more matched roles + salary bands inside.
          </p>
          <Button size="sm" onClick={onUnlock}>
            Unlock full job map
          </Button>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── STORIES (illustrative) ────────────────────────── */

const STORIES = [
  {
    quote:
      "I was a DevOps engineer plateauing on the same on-call rota for 3 years. Navi cut through it in one conversation and lined up a Platform-Engineer roadmap I could actually start that weekend.",
    name: "Arjun K.",
    role: "DevOps → Platform Engineer",
  },
  {
    quote:
      "I kept telling people I wanted to do AI research without admitting I had no publications. Navi named that out loud, then gave me an honest 24-week plan with the exact papers, repos and PIs to email.",
    name: "Meera S.",
    role: "Backend Eng → Aspiring AI Researcher",
  },
  {
    quote:
      "After 9 years as an Enterprise Architect I assumed my only move was VP. Navi showed me two adjacent paths — staff IC at a product company and a fractional architecture role — and the salary math made the decision obvious.",
    name: "Vikram R.",
    role: "Enterprise Architect → Staff Eng",
  },
];

function StoriesTab() {
  const [i, setI] = useState(0);
  const s = STORIES[i];
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Illustrative success stories
      </p>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <Quote className="mb-2 size-5 text-primary" />
        <p className="text-sm leading-relaxed">{s.quote}</p>
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-semibold">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.role}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {STORIES.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Story ${idx + 1}`}
              onClick={() => setI(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === i ? "w-6 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setI((idx) => (idx + 1) % STORIES.length)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}



