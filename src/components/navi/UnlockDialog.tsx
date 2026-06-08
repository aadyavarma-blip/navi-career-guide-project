import { useState } from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = "email" | "code";

export function UnlockDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUnlocked: () => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // PROTOTYPE MODE: hardcoded OTP — replace with real Supabase OTP when ready
  const PROTOTYPE_CODE = "123456";

  const sendCode = async () => {
    setErr(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErr("Enter a valid email.");
      return;
    }
    // Skip real email sending in prototype — just move to code step
    setStep("code");
  };

  const verify = async () => {
    setErr(null);
    if (code.trim().length < 6) {
      setErr("Enter the 6-digit code from your email.");
      return;
    }
    // PROTOTYPE MODE: accept hardcoded OTP only
    if (code.trim() !== PROTOTYPE_CODE) {
      setErr("Invalid code. Hint: try " + PROTOTYPE_CODE);
      return;
    }
    onUnlocked();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-bold tracking-tight text-2xl">
            Unlock your full 12-week roadmap
          </DialogTitle>
          <DialogDescription>
            We&apos;ll email you a 6-digit code. No password. No spam.
          </DialogDescription>
        </DialogHeader>

        {step === "email" && (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              type="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <Button onClick={sendCode} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Mail className="size-4" /> Send code
                </>
              )}
            </Button>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sent to <span className="font-medium text-foreground">{email}</span>.
              Check your inbox.
            </p>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              6-digit code
            </Label>
            <Input
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <Button onClick={verify} disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Unlock roadmap"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setStep("email")}
            >
              Use a different email
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
