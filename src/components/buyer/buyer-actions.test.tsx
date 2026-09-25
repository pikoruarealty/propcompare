import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { CompareScreen } from "./compare-screen";
import { EnquiryForm } from "./enquiry-form";
import { SavePropertyButton } from "./save-property-button";

const signedIn = () =>
  useSession.mockReturnValue({
    data: { user: { id: "u1" } },
    isPending: false,
  });
const signedOut = () =>
  useSession.mockReturnValue({ data: null, isPending: false });

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("SavePropertyButton", () => {
  it("sends a signed-out visitor to sign in and come back to the dossier", () => {
    signedOut();
    render(<SavePropertyButton propertyId="p1" slug="kimana" />);
    expect(
      screen.getByRole("link", { name: /sign in to save/i }),
    ).toHaveAttribute("href", "/login?next=%2Fproperties%2Fkimana");
  });

  it("starts as Saved when the property is already on the list, and removes it", async () => {
    signedIn();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) =>
        init?.method === "DELETE"
          ? Promise.resolve(new Response(null, { status: 204 }))
          : json({ data: [{ property: { id: "p1" } }] }),
      );
    render(<SavePropertyButton propertyId="p1" slug="kimana" />);

    const button = await screen.findByRole("button", { name: "Saved" });
    await userEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/saved-properties",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("says so, and keeps the state, when saving fails", async () => {
    signedIn();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      init?.method === "POST" ? json({ error: {} }, 500) : json({ data: [] }),
    );
    render(<SavePropertyButton propertyId="p1" slug="kimana" />);

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("EnquiryForm", () => {
  const props = {
    propertyId: "p1",
    slug: "kimana",
    propertyName: "The Kimana Towers",
    unitTypes: [{ id: "v1", name: "Block A" }],
  };

  it("asks a signed-out visitor to sign in first", () => {
    signedOut();
    render(<EnquiryForm {...props} />);
    expect(
      screen.getByRole("link", { name: /sign in with your mobile number/i }),
    ).toHaveAttribute("href", "/login?next=%2Fproperties%2Fkimana%23enquiry");
  });

  it("records the unlock, then sends the enquiry with the chosen unit type", async () => {
    signedIn();
    const calls: string[] = [];
    let enquiryBody: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      calls.push(String(url));
      if (String(url) === "/api/v1/enquiries") {
        enquiryBody = JSON.parse(String(init?.body));
      }
      return json({ ok: true }, 201);
    });
    render(<EnquiryForm {...props} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "v1");
    await userEvent.type(screen.getByRole("textbox"), "Is a corner unit free?");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
    expect(calls).toEqual(["/api/v1/dossier-unlocks", "/api/v1/enquiries"]);
    expect(enquiryBody).toEqual({
      propertyId: "p1",
      unitVariantId: "v1",
      message: "Is a corner unit free?",
    });
  });

  it("keeps the message when the send fails, so a retry loses nothing", async () => {
    signedIn();
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      String(url).includes("unlocks")
        ? json({}, 201)
        : json({ error: {} }, 500),
    );
    render(<EnquiryForm {...props} />);

    await userEvent.type(screen.getByRole("textbox"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/still here/i);
    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });
});

describe("the comparison's focus chips and saving", () => {
  const two = () => [
    { ...richDossierFixture, slug: "a", name: "Alpha Heights" },
    { ...richDossierFixture, slug: "b", name: "Beta Residency" },
  ];
  const groupOrder = () =>
    [...document.querySelectorAll("[data-group]")].map((el) =>
      el.getAttribute("data-group"),
    );

  it("brings the chosen groups to the top and keeps every group", async () => {
    signedOut();
    render(<CompareScreen dossiers={two()} requested={{}} />);
    const before = groupOrder();

    await userEvent.click(screen.getByRole("button", { name: "Amenities" }));

    const after = groupOrder();
    expect(after[0]).toBe("amenities");
    expect([...after].sort()).toEqual([...before].sort());
  });

  it("starts from the priorities guided intake left in this tab", () => {
    signedOut();
    window.sessionStorage.setItem(
      "propcompare.intake-priorities",
      JSON.stringify(["possession_speed", "location"]),
    );
    render(<CompareScreen dossiers={two()} requested={{}} />);

    expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(groupOrder()[0]).toBe("timeline");
  });

  it("offers a signed-out visitor a way to sign in to save the comparison", () => {
    signedOut();
    render(<CompareScreen dossiers={two()} requested={{}} />);
    expect(
      screen.getByRole("link", { name: /sign in to save this comparison/i }),
    ).toHaveAttribute("href", expect.stringContaining("/login?next="));
  });

  it("saves the properties and unit types on screen", async () => {
    signedIn();
    let body: { items: { propertyId: string; unitVariantId?: string }[] } = {
      items: [],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.method !== "POST") return json({ data: [] });
      body = JSON.parse(String(init.body));
      return json({ id: "c1" }, 201);
    });
    render(<CompareScreen dossiers={two()} requested={{}} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Save this comparison" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].propertyId).toBe(richDossierFixture.id);
    expect(body.items[0].unitVariantId).toBeDefined();
  });

  it("shows a comparison already saved as saved, and unsaves it", async () => {
    signedIn();
    const pair = two();
    const variantId = richDossierFixture.unitVariants[0].id;
    const calls: { url: string; method: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method });
      if (method === "DELETE")
        return Promise.resolve(new Response(null, { status: 204 }));
      return json({
        data: [
          {
            id: "c9",
            createdAt: "2026-09-24T00:00:00.000Z",
            items: pair.map((dossier, index) => ({
              propertyId: dossier.id,
              unitVariantId: variantId,
              displayOrder: index,
            })),
          },
        ],
      });
    });
    render(<CompareScreen dossiers={pair} requested={{}} />);

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(
      screen.queryByRole("button", { name: "Save this comparison" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Unsave" }));

    expect(
      await screen.findByRole("button", { name: "Save this comparison" }),
    ).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: "/api/v1/comparisons/c9",
      method: "DELETE",
    });
  });
});
