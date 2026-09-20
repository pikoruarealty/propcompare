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
      media={[]}
      variantNames={[]}
      editable
      reviewable
      pending={false}
      onReview={() => undefined}
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
        media={[]}
        variantNames={[]}
        editable={false}
        reviewable
        pending={false}
        onReview={() => undefined}
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
