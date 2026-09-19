"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { normaliseIndianMobile } from "@/lib/accounts/phone";
import { AuthField } from "./auth-field";

const OTP_LENGTH = 6;

const PHONE_ERROR = "Enter a valid 10-digit Indian mobile number.";
const SEND_ERROR =
  "We couldn't send a code just now. Please try again in a moment.";
const CODE_ERROR =
  "That code isn't right, or it has expired. Check it, or ask for a new one.";

/**
 * Buyer sign-in and sign-up in one flow: a phone number, then the code sent to
 * it. A first successful verification creates the account
 * (`signUpOnVerification` in `src/lib/auth.ts`), so there is no separate
 * sign-up screen.
 *
 * `returnTo` is already validated by the page (`safeReturnPath`). A wrong or
 * expired code keeps the buyer on the code step with the same destination and
 * lets them retry — nothing is recorded as an unlock until the verified session
 * exists (docs/app-flows/buyer.md, exception paths).
 */
export function BuyerLoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [phone, setPhone] = React.useState("");
  const [e164, setE164] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const sendCode = async (number: string): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const { error: sendError } = await authClient.phoneNumber.sendOtp({
        phoneNumber: number,
      });
      if (sendError) {
        setError(SEND_ERROR);
        return false;
      }
      return true;
    } catch {
      setError(SEND_ERROR);
      return false;
    } finally {
      setPending(false);
    }
  };

  const onSubmitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalised = normaliseIndianMobile(phone);
    if (!normalised) {
      setError(PHONE_ERROR);
      return;
    }
    setE164(normalised);
    if (await sendCode(normalised)) {
      setNotice(null);
      setStep("code");
    }
  };

  const onSubmitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!e164) return;
    if (code.length !== OTP_LENGTH) {
      setError(CODE_ERROR);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } = await authClient.phoneNumber.verify({
        phoneNumber: e164,
        code,
      });
      if (verifyError) {
        setError(CODE_ERROR);
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError(CODE_ERROR);
    } finally {
      setPending(false);
    }
  };

  const onResend = async () => {
    if (!e164) return;
    setCode("");
    if (await sendCode(e164)) setNotice("A new code is on its way.");
  };

  if (step === "phone") {
    return (
      <form onSubmit={onSubmitPhone} noValidate className="flex flex-col gap-6">
        <AuthField
          id="phone"
          label="Mobile number"
          prefix="+91"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98250 12345"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={error}
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base"
          disabled={pending}
        >
          {pending ? "Sending…" : "Send verification code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitCode} noValidate className="flex flex-col gap-6">
      <AuthField
        id="code"
        label="Verification code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        placeholder="6-digit code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        hint={`Sent to ${e164 ?? ""}`}
        error={error}
      />
      {notice ? (
        <p role="status" className="text-secondary text-sm">
          {notice}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending}
      >
        {pending ? "Verifying…" : "Verify and continue"}
      </Button>
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setCode("");
            setError(null);
            setNotice(null);
          }}
          className="hover:text-foreground underline underline-offset-4"
        >
          Use a different number
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={pending}
          className="hover:text-foreground underline underline-offset-4 disabled:opacity-50"
        >
          Send a new code
        </button>
      </div>
    </form>
  );
}
