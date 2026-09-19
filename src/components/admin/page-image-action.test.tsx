import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSuggestion } from "@/lib/ocr/page-router";
import { offersPageImage, PageImageAction } from "./page-image-action";

const suggestion = (over: Partial<PageSuggestion> = {}): PageSuggestion => ({
  page: 8,
  category: "other",
  confidence: 0.9,
  imagery: [],
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("offersPageImage", () => {
  it("offers every page until the brochure has been categorized", () => {
    expect(offersPageImage(undefined)).toBe(true);
  });

  it("then only pages with real imagery or a floor plan", () => {
    expect(offersPageImage(suggestion({ imagery: ["exterior_render"] }))).toBe(
      true,
    );
    expect(offersPageImage(suggestion({ category: "floor_plan" }))).toBe(true);
    expect(offersPageImage(suggestion({ imagery: ["logo"] }))).toBe(false);
    expect(offersPageImage(suggestion({ imagery: [] }))).toBe(false);
  });
});

describe("PageImageAction", () => {
  const setup = (s?: PageSuggestion) =>
    render(<PageImageAction submissionId="sub-1" page={8} suggestion={s} />);

  it("tells the admin how the imagery sits on the page", () => {
    setup(
      suggestion({ imagery: ["interior"], imageLayout: "multiple_images" }),
    );
    expect(screen.getByText("Several images")).toBeVisible();
  });

  it("defaults a floor-plan page to a floor plan and sends the chosen page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    setup(suggestion({ category: "floor_plan", caption: "3 BHK - A" }));

    await user.click(screen.getByRole("button", { name: /use as image/i }));
    expect(screen.getByRole("combobox")).toHaveValue("floor_plan");
    expect(screen.getByPlaceholderText(/3 BHK/)).toHaveValue("3 BHK - A");
    await user.click(screen.getByRole("button", { name: "Add image" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/submissions/sub-1/media/from-page",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      pageNumber: 8,
      mediaType: "floor_plan",
      unitVariantName: "3 BHK - A",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /added to the images/i,
    );
    expect(screen.getByRole("link", { name: "Review it" })).toHaveAttribute(
      "href",
      "/admin/submissions/sub-1",
    );
  });

  it("treats a page that is already added as done, not as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 409 })),
    );
    const user = userEvent.setup();
    setup(suggestion({ imagery: ["exterior_render"] }));
    await user.click(screen.getByRole("button", { name: /use as image/i }));
    await user.click(screen.getByRole("button", { name: "Add image" }));
    expect(await screen.findByRole("status")).toBeVisible();
  });

  it("shows the server's reason and lets the admin try again when it fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Choose a page from 1 to 3." } }),
          {
            status: 422,
          },
        ),
      ),
    );
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /use as image/i }));
    await user.click(screen.getByRole("button", { name: "Add image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a page from 1 to 3.",
    );
    expect(screen.getByRole("button", { name: "Add image" })).toBeEnabled();
  });

  it("can be cancelled without sending anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /use as image/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /use as image/i })).toBeVisible();
  });
});
