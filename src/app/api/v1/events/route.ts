import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import {
  deviceOf,
  readEventInput,
  recordingMode,
} from "@/lib/analytics/events";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
} from "@/lib/analytics/cookies";
import { recordEvent } from "@/lib/analytics/record";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4096;

const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;

/**
 * `POST /api/v1/events`: first-party product analytics (schema v20, v21). Always
 * `204`, whatever happens: telemetry never shows a visitor an error and never
 * tells a caller what it kept. Nothing is recorded for a crawler. A browser that
 * sends Global Privacy Control or Do Not Track is recorded anonymously: no cookie
 * is read or set and the event carries no visitor or visit id, so nothing links it
 * to any other. Everyone else gets a random visitor cookie, the same before and
 * after sign-in. No user id, IP or personal detail is stored either way
 * (`DECISIONS.md` 2026-09-25, 2026-09-26).
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const done = () => new Response(null, { status: 204, headers });

  const mode = recordingMode(request.headers);
  if (mode === "none") return done();
  const userAgent = request.headers.get("user-agent");

  const text = await request.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BODY) return done();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const input = readEventInput(body);
  if (!input) return done();

  let visitorId: string | null = null;
  let sessionId: string | null = null;
  if (mode === "identified") {
    const heldVisitor = request.cookies.get(VISITOR_COOKIE)?.value;
    const heldSession = request.cookies.get(SESSION_COOKIE)?.value;
    visitorId =
      heldVisitor && UUID.test(heldVisitor) ? heldVisitor : randomUUID();
    sessionId =
      heldSession && UUID.test(heldSession) ? heldSession : randomUUID();
    headers.append(
      "Set-Cookie",
      cookie(VISITOR_COOKIE, visitorId, VISITOR_MAX_AGE),
    );
    headers.append(
      "Set-Cookie",
      cookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE),
    );
  }

  try {
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    await recordEvent(db, input, {
      visitorId,
      sessionId,
      signedIn: Boolean(session),
      device: deviceOf(userAgent),
      ownHost: request.headers.get("host"),
    });
  } catch (cause) {
    console.error("POST /api/v1/events: not recorded", cause);
  }
  return done();
};
