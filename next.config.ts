import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These load native binaries or read files relative to their own package
  // (fonts and character maps for pdf.js), so they must run from node_modules
  // rather than be bundled. Used only by the server-side brochure page renderer.
  serverExternalPackages: ["sharp", "@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
