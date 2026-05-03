import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:8000";
const supabaseHost = new URL(supabaseUrl).hostname;
const supabaseProtocol = new URL(supabaseUrl).protocol.replace(":", "") as "http" | "https";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: supabaseProtocol, hostname: supabaseHost },
    ],
  },
};

export default nextConfig;
