import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ZoomableImage } from "./zoomable-image";

const renderImage = () =>
  render(<ZoomableImage src="/api/v1/media/p1" alt="Exterior" />);

const level = () => screen.getByRole("button", { name: /zoom$/i });
const percent = () => screen.getByText(/^\d+%$/).textContent;
const frame = () =>
  document.querySelector<HTMLElement>("[data-slot=zoom-frame]")!;

describe("ZoomableImage — buttons", () => {
  it("starts fitted, with nothing to zoom out or reset", () => {
    renderImage();

    expect(percent()).toBe("100%");
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(level()).toBeDisabled();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/v1/media/p1");
  });

  it("zooms in and out by a step, and resets to fit", async () => {
    renderImage();

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("150%");
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("225%");
    expect(screen.getByRole("img").getAttribute("style")).toContain(
      "scale(2.25)",
    );

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(percent()).toBe("150%");

    await userEvent.click(level());
    expect(percent()).toBe("100%");
    expect(level()).toBeDisabled();
  });

  it("stops at the maximum", async () => {
    renderImage();
    for (let i = 0; i < 10; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    }

    expect(percent()).toBe("500%");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  });
});

describe("ZoomableImage — other ways to zoom", () => {
  it("zooms with the mouse wheel: forward in, back out", () => {
    renderImage();

    fireEvent.wheel(frame(), { deltaY: -200 });
    const zoomedIn = Number(percent()!.replace("%", ""));
    expect(zoomedIn).toBeGreaterThan(100);

    fireEvent.wheel(frame(), { deltaY: 200 });
    expect(percent()).toBe("100%");
  });

  it("stops the wheel from scrolling or zooming the page behind", () => {
    renderImage();

    const notCancelled = fireEvent.wheel(frame(), { deltaY: -100 });

    expect(notCancelled).toBe(false);
  });

  it("double-click zooms in and a second double-click returns to fit", () => {
    renderImage();

    fireEvent.doubleClick(frame(), { clientX: 10, clientY: 10 });
    expect(percent()).toBe("250%");
    fireEvent.doubleClick(frame(), { clientX: 10, clientY: 10 });
    expect(percent()).toBe("100%");
  });

  it("does not treat a double-click on a control as a picture zoom", async () => {
    renderImage();
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    fireEvent.doubleClick(screen.getByRole("button", { name: "Zoom out" }));

    expect(percent()).not.toBe("100%");
  });

  it("zooms with +, - and 0 on the keyboard", async () => {
    renderImage();

    await userEvent.keyboard("+");
    expect(percent()).toBe("150%");
    await userEvent.keyboard("=");
    expect(percent()).toBe("225%");
    await userEvent.keyboard("-");
    expect(percent()).toBe("150%");
    await userEvent.keyboard("0");
    expect(percent()).toBe("100%");
  });

  it("leaves browser shortcuts such as Ctrl+minus alone", async () => {
    renderImage();
    await userEvent.keyboard("+");

    await userEvent.keyboard("{Control>}-{/Control}");

    expect(percent()).toBe("150%");
  });
});
