/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/api/admin/employees",
        destination: "/api/admin/internal-users",
        permanent: false,
      },
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
