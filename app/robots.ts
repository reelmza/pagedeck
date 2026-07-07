import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Served at /robots.txt (Next.js file convention). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/thank-you", // payment redirect page — keep out of search
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
