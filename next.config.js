/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http', // or 'https' if the URLs use https
        hostname: 'media.steampowered.com',
        port: '', // Leave empty if no port is specified
        pathname: '/steamcommunity/public/images/apps/**',
      },
    ],
  },
};

export default nextConfig; 