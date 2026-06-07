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
};

export default nextConfig;
