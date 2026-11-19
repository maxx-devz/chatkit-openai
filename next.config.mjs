/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Native image sanitization is loaded only by this upload handler. Include
  // its runtime assets explicitly; a local next start alone cannot prove tracing.
  outputFileTracingIncludes: {
    "/api/admin/agency/brand": ["node_modules/sharp/**/*", "node_modules/@img/**/*"],
  },
  // Keep same-origin debugger rewrites on the original host. Normalization
  // otherwise changes 127.0.0.1 to localhost, which can become an IPv6 proxy.
  skipProxyUrlNormalize: true,
  async redirects() {
    return [
      {
        source: "/api/employee/:path*",
        destination: "/api/internal/:path*",
        permanent: false,
      },
      {
        source: "/employee/:path*",
        destination: "/internal/:path*",
        permanent: false,
      },
    ];
  },
  async headers() {
    const headers = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [{ source: "/:path*", headers }];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
