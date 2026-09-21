import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  richDossierFixture,
  richSummaryFixture,
} from "@/lib/properties/fixtures";
import type { PublicDeveloper } from "@/lib/properties/developer-profile";
import { DeveloperScreen, developerHref } from "./developer-screen";
import { DossierScreen } from "./dossier-screen";

const developer: PublicDeveloper = {
  id: richDossierFixture.developer.id,
  name: richDossierFixture.developer.name,
  description: "Ahmedabad-based developer.",
  website: null,
  properties: [richSummaryFixture],
};

describe("the developer profile", () => {
  it("shows who the developer is and their published projects", () => {
    render(<DeveloperScreen developer={developer} />);
    expect(
      screen.getByRole("heading", { level: 1, name: developer.name }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ahmedabad-based developer.")).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-slot="property-card"]'),
    ).toHaveLength(1);
    expect(screen.getByText("1 published project")).toBeInTheDocument();
  });

  it("says so, and states the gaps, when nothing is published or stated", () => {
    render(
      <DeveloperScreen
        developer={{
          ...developer,
          description: null,
          properties: [],
        }}
      />,
    );
    expect(screen.getByText(/No project is published/)).toBeInTheDocument();
    expect(screen.getAllByText("Not stated").length).toBeGreaterThan(0);
  });
});

describe("developer names link to the profile, since names are not unique", () => {
  it("links the developer's name in the dossier by id", () => {
    render(<DossierScreen dossier={richDossierFixture} />);
    const hero = document.querySelector('[data-slot="dossier-hero"]');
    expect(
      within(hero as HTMLElement).getByRole("link", {
        name: richDossierFixture.developer.name,
      }),
    ).toHaveAttribute("href", developerHref(richDossierFixture.developer.id));
  });
});
