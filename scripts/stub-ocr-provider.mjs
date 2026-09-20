/**
 * A stand-in for OpenRouter's chat endpoint, for checking the extraction flow end
 * to end without a paid call. It answers the scopes the check confirms (project
 * details on page 1, floor plans on page 8) with fixed, valid data, and can be
 * switched to fail so the failure and "Try again" path can be exercised.
 *
 *   node scripts/stub-ocr-provider.mjs [port]      (default 4010)
 *
 *   POST /__stub/fail    -> every request now fails with HTTP 500
 *   POST /__stub/ok      -> requests succeed again
 *   POST /__stub/delay/<ms> -> every answer now waits that long first
 *   GET  /__stub/count   -> how many extraction requests it has served
 *
 * Point the app at it with OPENROUTER_OCR_ENDPOINT=http://localhost:4010/chat.
 */
import { readFileSync } from "node:fs";
import http from "node:http";

// Optional: answer with real saved answers (an OCR checkpoint file) for the scopes
// it has, and a deliberately messy floor-plan answer, so the pipeline can be
// rehearsed on real-shaped data for free.
//   STUB_REPLAY=.local/ocr-checkpoints/<job>.json STUB_FLOOR_PAGES=8,9,10
const replay = process.env.STUB_REPLAY
  ? Object.fromEntries(
      JSON.parse(readFileSync(process.env.STUB_REPLAY, "utf8")).scopes.map(
        (scope) => [scope.scopeKey, scope.response],
      ),
    )
  : {};
const floorPage = Number((process.env.STUB_FLOOR_PAGES ?? "8").split(",")[0]);

const port = Number(process.argv[2] ?? 4010);
let failing = false;
let served = 0;
// Provider request ids must be unique across runs (the database enforces it).
const runId = Math.random().toString(36).slice(2, 8);
let delayMs = 0;

const messyFloorPlans = () => ({
  fields: [],
  unitVariants: [
    {
      variantName: "Type A - 3 BHK",
      details: {
        unitsPerFloor: "four",
        areas: [{ basis: "carpet", areaSqft: 1250 }],
        dimensions: {
          rooms: [{ name: "Living", lengthFt: 15, widthFt: 12 }],
          foyer: [
            { lengthFt: 12.32, widthFt: 2.11 },
            { lengthFt: 16.74, widthFt: 2.21 },
          ],
          balconies: null,
        },
        somethingExtra: "the model added this on its own",
      },
      confidence: 0.9,
      evidence: [{ pageNumber: floorPage, sourceSnippet: "Type A" }],
    },
    {
      variantName: "Type B - 4 BHK Duplex",
      details: { totalUnitsOfVariant: 24, dimensions: null },
      confidence: 0.85,
      evidence: [{ pageNumber: floorPage, sourceSnippet: "Type B" }],
    },
  ],
  unmappedRawEvidence: [],
});

const answerFor = (scopeKey) => {
  if (replay[scopeKey]) return replay[scopeKey];
  if (scopeKey === "floor-plans" && process.env.STUB_REPLAY) {
    return messyFloorPlans();
  }
  if (scopeKey === "project-details") {
    return {
      fields: [
        {
          fieldKey: "property.name",
          value: "Stub Towers",
          confidence: 0.97,
          evidence: [{ pageNumber: 1, sourceSnippet: "Stub Towers" }],
        },
        {
          fieldKey: "property.city",
          value: "Ahmedabad",
          confidence: 0.9,
          evidence: [{ pageNumber: 1, sourceSnippet: "Ahmedabad" }],
        },
      ],
      unitVariant: null,
      unmappedRawEvidence: [],
    };
  }
  if (scopeKey === "floor-plans") {
    return {
      fields: [],
      unitVariants: [
        {
          variantName: "Type A",
          details: { unitsPerFloor: 4 },
          confidence: 0.88,
          evidence: [{ pageNumber: 8, sourceSnippet: "Type A" }],
        },
      ],
      unmappedRawEvidence: [],
    };
  }
  return { fields: [], unitVariant: null, unmappedRawEvidence: [] };
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__stub/fail") {
    failing = true;
    res.end("failing");
    return;
  }
  if (req.method === "POST" && req.url === "/__stub/ok") {
    failing = false;
    res.end("ok");
    return;
  }
  const delay = req.url?.match(/^\/__stub\/delay\/(\d+)$/);
  if (req.method === "POST" && delay) {
    delayMs = Number(delay[1]);
    res.end("delay " + delayMs);
    return;
  }
  if (req.method === "GET" && req.url === "/__stub/count") {
    res.end(String(served));
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    served += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (failing) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("stub failure");
      return;
    }
    let scopeKey = "";
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      scopeKey = body.messages[0].content[0].file.filename.replace(
        /\.pdf$/,
        "",
      );
    } catch {
      /* fall through with an empty scope */
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({
        id: `stub-${runId}-${served}`,
        choices: [
          {
            delta: { content: JSON.stringify(answerFor(scopeKey)) },
            finish_reason: "stop",
          },
        ],
      })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({
        id: `stub-${runId}-${served}`,
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
      })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
});

server.listen(port, () => console.log(`stub provider on :${port}`));
