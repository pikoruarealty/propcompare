import { constants } from "node:crypto";
import https from "node:https";

/**
 * A `fetch`-shaped call for hosts whose TLS server does not support secure
 * renegotiation.
 *
 * GujRERA's server is one: Node's OpenSSL 3 refuses it by default
 * (`ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`) while curl and browsers accept
 * it. `SSL_OP_LEGACY_SERVER_CONNECT` allows the connection, and this module is the
 * only place it is set, for named hosts only, never process-wide. That is an
 * acceptable weakening here because everything sent is a public search term and
 * everything read is public regulator data; nothing secret crosses the connection.
 * Do not use it for a host that receives credentials or personal data.
 *
 * Only `https:` URLs on an allowed host are made; anything else is refused.
 */
const ALLOWED_HOSTS = new Set(["gujrera.gujarat.gov.in"]);

export const legacyTlsFetch = (
  url: string,
  init: RequestInit = {},
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
      reject(new TypeError(`legacyTlsFetch does not call ${target.hostname}`));
      return;
    }
    const body = typeof init.body === "string" ? init.body : undefined;
    const request = https.request(
      target,
      {
        method: init.method ?? "GET",
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...(body === undefined
            ? {}
            : { "Content-Length": String(Buffer.byteLength(body)) }),
        },
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) headers.append(name, item);
            } else if (value !== undefined) {
              headers.set(name, value);
            }
          }
          const status = response.statusCode ?? 502;
          // A body is not allowed on these statuses.
          const noBody = [101, 204, 205, 304].includes(status);
          resolve(
            new Response(noBody ? null : Buffer.concat(chunks), {
              status,
              headers,
            }),
          );
        });
      },
    );
    request.on("error", reject);
    const signal = init.signal;
    if (signal) {
      const abort = () => request.destroy(new Error("aborted"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    request.end(body);
  });
