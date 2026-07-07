import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Served at /sitemap.xml (Next.js file convention).
 *  /thank-you is deliberately absent — it's a payment redirect target. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/pdf-organize`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
