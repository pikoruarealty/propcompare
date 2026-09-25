import type { DossierMedia } from "./types";

/**
 * The picture that stands for a property where only one fits (a comparison
 * column, the dossier's fallback plate). The same order the listing cards use:
 * the picture flagged primary, then a photo of the building over a floor plan,
 * and a floor plan only when there is no photo at all. A video or a brochure PDF is
 * never a plate. Nothing is invented: no picture means `null`.
 */
export const identityPicture = (
  media: readonly DossierMedia[],
): DossierMedia | null => {
  const pictures = media.filter(
    (item) => item.mediaType === "photo" || item.mediaType === "floor_plan",
  );
  return (
    pictures.find((item) => item.mediaType === "photo" && item.isPrimary) ??
    pictures.find((item) => item.mediaType === "photo") ??
    pictures.find((item) => item.isPrimary) ??
    pictures[0] ??
    null
  );
};
