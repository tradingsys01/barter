import Script from "next/script";

export function Analytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;

  if (!websiteId || !umamiUrl) return null;

  return (
    <Script
      defer
      src={`${umamiUrl}/script.js`}
      data-website-id={websiteId}
    />
  );
}
