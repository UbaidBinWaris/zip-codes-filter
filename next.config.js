/** @type {import('next').NextConfig} */
const nextConfig = {
  // Opt out of PPR / dynamic IO for the home page (we do synchronous fs reads)
  experimental: {},
};

module.exports = nextConfig;
