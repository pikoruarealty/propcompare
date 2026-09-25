/**
 * The Google Maps link an admin sets for a project (schema v15), and the small
 * map the dossier shows from it. Pure, so the rules for what counts as a Google
 * Maps link, and what can be drawn as an embedded map, are tested without a
 * browser.
 *
 * Two kinds of link are useful and they are not the same thing:
 *
 * - A **full link** (a place page, a search, a pin with `@lat,lng`) always opens
 *   in Google Maps, and when it carries a place or coordinates it can be drawn
 *   as a map on the page too.
 * - A **short share link** (`maps.app.goo.gl/...`) opens in Google Maps but
 *   cannot be drawn on the page: turning it into a place would mean following it
 *   over the network. It is kept and offered as a link only.
 *
 * Nothing here calls Google, and nothing is guessed: a link with no readable
 * place gets no embedded map rather than a map of somewhere else.
 */

const MAX_LENGTH = 2000;

const parse = (text: string): URL | null => {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
};

const isGoogleHost = (host: string): boolean =>
  host === "google.com" ||
  host === "www.google.com" ||
  host === "maps.google.com" ||
  /^(www\.)?google\.[a-z.]{2,6}$/.test(host);

/** Whether this is an https link to Google Maps, of a kind worth storing. */
export const isGoogleMapsUrl = (text: string): boolean => {
  if (text.length > MAX_LENGTH) return false;
  const url = parse(text);
  if (!url || url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host === "maps.google.com") return true;
  return isGoogleHost(host) && url.pathname.startsWith("/maps");
};

const COORDINATES = /(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/;

const inRange = (lat: number, lng: number): boolean =>
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * The address of an embeddable map for this link, or `null` when it cannot be
 * drawn on the page. An embed link (Share, then "Embed a map") is used as it is;
 * otherwise coordinates in the link are used, then a place or search text.
 */
export const mapEmbedUrl = (text: string | null): string | null => {
  if (text === null || !isGoogleMapsUrl(text)) return null;
  const url = parse(text) as URL;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || host === "goo.gl") return null;

  if (url.pathname.startsWith("/maps/embed")) return url.toString();

  const embed = (query: string) =>
    `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;

  // A pin in the address: .../@23.0369,72.5079,17z or !3d23.0369!4d72.5079.
  const atPin = url.pathname.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  const dataPin = url.pathname.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  const pin = dataPin ?? atPin;
  if (pin) {
    const lat = Number(pin[1]);
    const lng = Number(pin[2]);
    if (inRange(lat, lng)) return embed(`${lat},${lng}`);
  }

  // A query in the address: ?q=lat,lng, ?ll=lat,lng, ?query=text or ?q=text.
  for (const name of ["q", "query", "ll", "destination"]) {
    const value = url.searchParams.get(name)?.trim();
    if (!value) continue;
    const coordinates = value.match(COORDINATES);
    if (coordinates && coordinates[0] === value.replace(/\s+/g, "")) {
      const lat = Number(coordinates[1]);
      const lng = Number(coordinates[2]);
      if (inRange(lat, lng)) return embed(`${lat},${lng}`);
    }
    if (name === "q" || name === "query") return embed(value);
  }

  // A place page: /maps/place/Anamika+High+Point/... (the name is the query).
  const place = url.pathname.match(/^\/maps\/(?:place|search)\/([^/@]+)/);
  if (place) {
    const name = decodeURIComponent(place[1].replace(/\+/g, " ")).trim();
    if (name !== "") return embed(name);
  }
  return null;
};
