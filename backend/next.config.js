require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["chromadb"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS"       },
          { key: "Access-Control-Allow-Headers", value: "Content-Type"           },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
