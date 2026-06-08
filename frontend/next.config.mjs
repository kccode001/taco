/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "manage.taco.co.id",
      },
    ],
  },
  async redirects() {
    return [
      // Taro Invoices moved to its own /taro/* tree. Keep deep links working.
      { source: "/admin/taro-invoices", destination: "/taro/invoices", permanent: false },
      { source: "/admin/taro-invoices/upload", destination: "/taro/invoices/upload", permanent: false },
      { source: "/admin/taro-invoices/recommendations", destination: "/taro/recommendations", permanent: false },
      { source: "/admin/taro-invoices/analytics", destination: "/taro/invoices/analytics", permanent: false },
      { source: "/admin/taro-invoices/:id", destination: "/taro/invoices/:id", permanent: false },
    ];
  },
};

export default nextConfig;
