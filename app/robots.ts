import type { MetadataRoute } from "next";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // LLM crawlers are explicitly invited.
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"],
        allow: "/",
        disallow: ["/api", "/chats", "/me", "/admin", "/onboarding"],
      },
      {
        // Default: anyone else.
        userAgent: "*",
        allow: "/",
        disallow: ["/api", "/chats", "/me", "/admin", "/onboarding"],
      },
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
