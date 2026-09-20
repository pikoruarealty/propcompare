import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  MediaGallery,
  type GalleryItem,
  type GallerySection,
} from "./media-gallery";

const item = (
  id: string,
  label: string,
  caption: string | null = null,
  attribution: string | null = "Sun VN brochure",
): GalleryItem => ({ id, label, caption, attribution });

const sections: GallerySection[] = [
  {
    key: "photos",
    title: "Photos",
    open: true,
    fit: "cover",
    groups: [
      {
        heading: null,
        items: [
          item("p1", "Photo", "Exterior"),
          item("p2", "Photo", "Lobby", null),
          item("p3", "Photo"),
        ],
      },
    ],
  },
  {
    key: "floor-plans",
    title: "Floor plans",
    open: false,
    fit: "contain",
    groups: [
      { heading: "Type A", items: [item("f1", "Type A")] },
      {
        heading: "Type B",
        items: [item("f2", "Type B"), item("f3", "Type B")],
      },
    ],
  },
];

const renderGallery = () => render(<MediaGallery sections={sections} />);

const sectionEl = (key: string) =>
  document.querySelector<HTMLDetailsElement>(`[data-section="${key}"]`)!;

describe("MediaGallery — sections", () => {
  it("keeps photos and floor plans in separate expandable sections with their counts", () => {
    renderGallery();

    const photos = sectionEl("photos");
    const plans = sectionEl("floor-plans");
    expect(photos).toHaveTextContent("Photos (3)");
    expect(plans).toHaveTextContent("Floor plans (3)");
    // Photos start open; the (longer) list of plans starts closed.
    expect(photos.open).toBe(true);
    expect(plans.open).toBe(false);
    // No picture belongs to both.
    expect(within(photos).queryByText("Type A")).toBeNull();
    expect(within(plans).queryByText("Exterior")).toBeNull();
  });

  it("groups floor plans under their unit type", () => {
    renderGallery();

    const plans = sectionEl("floor-plans");
    expect(
      within(plans)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Type A", "Type B"]);
    expect(within(plans).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows small cards through the media route, with each credit", () => {
    renderGallery();

    const photos = sectionEl("photos");
    const images = [...photos.querySelectorAll("img")];
    // Cards load the small version; only the pop-up loads the full picture.
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "/api/v1/media/p1?size=thumb",
      "/api/v1/media/p2?size=thumb",
      "/api/v1/media/p3?size=thumb",
    ]);
    // Cards are thumbnails, not full-width pictures.
    expect(images.every((img) => img.className.includes("size-full"))).toBe(
      true,
    );
    expect(within(photos).getAllByText(/Credit: Sun VN brochure/)).toHaveLength(
      2,
    );
  });

  it("opens no pop-up until a card is chosen", () => {
    renderGallery();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("MediaGallery — the pop-up carousel", () => {
  it("opens on the chosen picture, with its credit and position", async () => {
    renderGallery();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Lobby, 2 of 3" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Photo: Lobby",
    );
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "/api/v1/media/p2",
    );
    expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
    // p2 has no credit, so none is claimed.
    expect(within(dialog).queryByText(/Credit:/)).toBeNull();
  });

  it("moves with the buttons and wraps at both ends", async () => {
    renderGallery();
    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Exterior, 1 of 3" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Previous picture" }),
    );
    expect(within(dialog).getByText("3 of 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "/api/v1/media/p3",
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Next picture" }),
    );
    expect(within(dialog).getByText("1 of 3")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Credit: Sun VN brochure/),
    ).toBeInTheDocument();
  });

  it("moves with the arrow keys and closes with Escape", async () => {
    renderGallery();
    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Exterior, 1 of 3" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(within(dialog).getByText("3 of 3")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with the Close button", async () => {
    renderGallery();
    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Exterior, 1 of 3" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("carries on through every floor plan of a section, across unit types, and never into photos", async () => {
    renderGallery();
    // Floor plans are collapsed by default, but their cards are still reachable.
    await userEvent.click(
      screen.getByRole("button", { name: "Open Type A, 1 of 3" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Next picture" }),
    );
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Type B");
    expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Next picture" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Next picture" }),
    );
    // Wrapped back to the first plan, not on to a photo.
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "/api/v1/media/f1",
    );
  });

  it("starts each picture fitted: zoom does not carry over to the next one", async () => {
    renderGallery();
    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Exterior, 1 of 3" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Zoom in" }),
    );
    expect(within(dialog).getByText("150%")).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Next picture" }),
    );
    expect(within(dialog).getByText("100%")).toBeInTheDocument();
  });

  it("keeps the arrow keys for moving between pictures while zoomed", async () => {
    renderGallery();
    await userEvent.click(
      screen.getByRole("button", { name: "Open Photo: Exterior, 1 of 3" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.keyboard("+");
    expect(within(dialog).getByText("150%")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");

    expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
  });

  it("disables the arrows when a section has a single picture", async () => {
    render(
      <MediaGallery
        sections={[
          {
            key: "photos",
            title: "Photos",
            open: true,
            fit: "cover",
            groups: [{ heading: null, items: [item("only", "Photo")] }],
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Open Photo/ }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Next picture" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Previous picture" }),
    ).toBeDisabled();
    expect(within(dialog).getByText("1 of 1")).toBeInTheDocument();
  });
});
