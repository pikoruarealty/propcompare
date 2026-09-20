import { constants } from "node:crypto";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("node:https", () => ({ default: { request } }));

const { legacyTlsFetch } = await import("./legacy-tls-fetch");

/** A stand-in for https.request: records how it was called and, once the code
 * finishes writing the request (`end`), answers as told. */
const answerWith = (
  status: number,
  body: string,
  headers: Record<string, string | string[]> = {},
) => {
  let deliver: () => void = () => {};
  const req = Object.assign(new EventEmitter(), {
    end: vi.fn(() => queueMicrotask(deliver)),
    destroy: vi.fn((error?: Error) => req.emit("error", error)),
  });
  request.mockImplementation((_url, _options, onResponse) => {
    deliver = () => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers,
      });
      onResponse(response);
      response.emit("data", Buffer.from(body));
      response.emit("end");
    };
    return req;
  });
  return req;
};

beforeEach(() => request.mockReset());

describe("legacyTlsFetch", () => {
  it("allows legacy renegotiation, for the request it makes and nothing else", async () => {
    answerWith(200, "{}");

    await legacyTlsFetch("https://gujrera.gujarat.gov.in/x");

    const options = request.mock.calls[0][1];
    expect(options.secureOptions).toBe(constants.SSL_OP_LEGACY_SERVER_CONNECT);
    // Certificates are still checked: nothing here turns verification off.
    expect(options).not.toHaveProperty("rejectUnauthorized");
  });

  it("refuses any host that is not on the list, without connecting", async () => {
    await expect(legacyTlsFetch("https://example.com/x")).rejects.toThrow(
      /does not call example\.com/,
    );
    await expect(
      legacyTlsFetch("https://gujrera.gujarat.gov.in.evil.test/x"),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses plain http even for the allowed host", async () => {
    await expect(
      legacyTlsFetch("http://gujrera.gujarat.gov.in/x"),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the status, headers and body as a Response", async () => {
    answerWith(200, '{"ok":true}', {
      "content-type": "application/json",
      "set-cookie": ["a=1", "b=2"],
    });

    const response = await legacyTlsFetch("https://gujrera.gujarat.gov.in/x");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("passes through an error status rather than throwing", async () => {
    answerWith(503, "busy");

    const response = await legacyTlsFetch("https://gujrera.gujarat.gov.in/x");

    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);
  });

  it("sends a JSON body with its length, on the method asked for", async () => {
    const req = answerWith(200, "{}");
    const body = JSON.stringify({ query: "RAA1", note: "é" });

    await legacyTlsFetch("https://gujrera.gujarat.gov.in/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const options = request.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Length"]).toBe(
      String(Buffer.byteLength(body)),
    );
    expect(req.end).toHaveBeenCalledWith(body);
  });

  it("does not put a body on a status that cannot have one", async () => {
    answerWith(204, "");

    const response = await legacyTlsFetch("https://gujrera.gujarat.gov.in/x");

    expect(response.status).toBe(204);
  });

  it("fails when the connection fails", async () => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: () => void;
    };
    req.end = () =>
      queueMicrotask(() => req.emit("error", new Error("ECONNRESET")));
    req.destroy = vi.fn();
    request.mockReturnValue(req);

    await expect(
      legacyTlsFetch("https://gujrera.gujarat.gov.in/x"),
    ).rejects.toThrow("ECONNRESET");
  });

  it("stops the request when the caller's timeout fires", async () => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };
    req.end = () => {};
    req.destroy = vi.fn((error?: Error) => req.emit("error", error));
    request.mockReturnValue(req);
    const controller = new AbortController();

    const pending = legacyTlsFetch("https://gujrera.gujarat.gov.in/x", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow("aborted");
    expect(req.destroy).toHaveBeenCalled();
  });
});
