import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MediaPanel } from "./media-panel";

const published = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    mediaType: "photo" as const,
    caption: "Tower from the river",
    attribution: "Sun VN",
    unitVariantName: null,
    isPrimary: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    mediaType: "floor_plan" as const,
    caption: null,
    attribution: null,
    unitVariantName: "Block A",
    isPrimary: false,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    mediaType: "brochure_pdf" as const,
    caption: null,
    attribution: null,
    unitVariantName: null,
    isPrimary: false,
  },
];

const renderPanel = (
  overrides: Partial<React.ComponentProps<typeof MediaPanel>> = {},
) => {
  const onSetRemoved = vi.fn(async () => null);
  render(
    <MediaPanel
      submissionId="s1"
      published={published}
      removedIds={[]}
      onSetRemoved={onSetRemoved}
      mainPhotoId={null}
      onSetMainPhoto={async () => null}
      media={[]}
      variantNames={[]}
      editable
      reviewable
      pending={false}
      onReview={() => undefined}
      onDelete={() => undefined}
      onUploaded={() => undefined}
      {...overrides}
    />,
  );
  return { onSetRemoved };
};

const cards = () =>
  document.querySelectorAll<HTMLElement>('[data-slot="published-picture"]');

describe("MediaPanel — pictures already on the listing", () => {
  it("shows each live picture with a small preview from the media route, and a label for one that is not an image", () => {
    renderPanel();

    expect(cards()).toHaveLength(3);
    const [photo, plan, brochure] = Array.from(cards());
    expect(within(photo).getByRole("img")).toHaveAttribute(
      "src",
      `/api/v1/media/${published[0].id}?size=thumb`,
    );
    expect(photo).toHaveTextContent("Photo");
    expect(photo).toHaveTextContent("Credit: Sun VN");
    expect(plan).toHaveTextContent("Floor plan · Block A");
    expect(within(brochure).queryByRole("img")).toBeNull();
    expect(brochure).toHaveTextContent("Brochure");
  });

  it("takes a picture off by saving the new list, and puts it back by saving it without", async () => {
    const user = userEvent.setup();
    const { onSetRemoved } = renderPanel({ removedIds: [published[1].id] });

    await user.click(
      within(cards()[0]).getByRole("button", { name: "Take off the listing" }),
    );
    expect(onSetRemoved).toHaveBeenLastCalledWith([
      published[1].id,
      published[0].id,
    ]);

    await user.click(
      within(cards()[1]).getByRole("button", { name: "Keep this picture" }),
    );
    expect(onSetRemoved).toHaveBeenLastCalledWith([]);
  });

  it("says plainly which pictures come off when this is published", () => {
    renderPanel({ removedIds: [published[0].id] });
    expect(cards()[0]).toHaveAttribute("data-removed", "true");
    expect(cards()[0]).toHaveTextContent(
      "Comes off the listing when this is published.",
    );
    expect(cards()[1]).toHaveAttribute("data-removed", "false");
    expect(cards()[1]).not.toHaveTextContent("Comes off");
  });

  it("shows a save error, and offers no buttons when the edit cannot be changed", async () => {
    const user = userEvent.setup();
    const onSetRemoved = vi.fn(async () => "That picture is not live.");
    const view = renderPanel({ onSetRemoved });
    await user.click(
      within(cards()[0]).getByRole("button", { name: "Take off the listing" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That picture is not live.",
    );
    view.onSetRemoved.mockClear();
  });

  it("is a plain list when the edit cannot be changed, and absent for a new property", () => {
    const { container } = render(
      <MediaPanel
        submissionId="s1"
        published={published}
        removedIds={[]}
        onSetRemoved={async () => null}
        mainPhotoId={null}
        onSetMainPhoto={async () => null}
        media={[]}
        variantNames={[]}
        editable={false}
        reviewable
        pending={false}
        onReview={() => undefined}
        onDelete={() => undefined}
        onUploaded={() => undefined}
      />,
    );
    expect(
      within(container).queryByRole("button", { name: "Take off the listing" }),
    ).toBeNull();

    document.body.innerHTML = "";
    renderPanel({ published: [] });
    expect(
      document.querySelector('[data-slot="published-pictures"]'),
    ).toBeNull();
  });
});

describe("MediaPanel — the main photo", () => {
  const candidate = (over: Record<string, unknown> = {}) => ({
    id: "44444444-4444-4444-8444-444444444444",
    submissionId: "s1",
    mediaType: "photo" as const,
    caption: "New clubhouse",
    attribution: "Sun VN",
    sourceKind: "own" as const,
    unitVariantName: null,
    reviewStatus: "confirmed" as const,
    isPublic: true,
    previewUrl: "https://example.test/x.webp",
    ...over,
  });

  it("marks the current main photo, and offers the action on the other photos only", async () => {
    const user = userEvent.setup();
    const onSetMainPhoto = vi.fn(async () => null);
    renderPanel({
      mainPhotoId: published[0].id,
      onSetMainPhoto,
      media: [candidate()] as never,
    });

    const [photo, plan] = Array.from(cards());
    expect(
      within(photo).getByText(/Main photo: stands for the project/),
    ).toBeVisible();
    expect(
      within(photo).queryByRole("button", { name: "Make main photo" }),
    ).toBeNull();
    // A floor plan can never be the main photo.
    expect(
      within(plan).queryByRole("button", { name: "Make main photo" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Make main photo" }));
    expect(onSetMainPhoto).toHaveBeenCalledWith(candidate().id);
  });

  it("offers it on a live photo, and does not offer it on an unapproved or private candidate", async () => {
    const user = userEvent.setup();
    const onSetMainPhoto = vi.fn(async () => null);
    renderPanel({
      mainPhotoId: candidate().id,
      onSetMainPhoto,
      media: [
        candidate(),
        candidate({
          id: "55555555-5555-4555-8555-555555555555",
          reviewStatus: "needs_review",
        }),
        candidate({
          id: "66666666-6666-4666-8666-666666666666",
          isPublic: false,
        }),
      ] as never,
    });

    // Only the live photo can be chosen: the one candidate that is approved and
    // public is already the main photo, and the other two cannot be.
    const buttons = screen.getAllByRole("button", { name: "Make main photo" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(onSetMainPhoto).toHaveBeenCalledWith(published[0].id);
  });

  it("shows the reason when the choice cannot be saved", async () => {
    const user = userEvent.setup();
    renderPanel({
      mainPhotoId: null,
      onSetMainPhoto: async () => "That field is not active.",
    });
    await user.click(screen.getByRole("button", { name: "Make main photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That field is not active.",
    );
  });
});
