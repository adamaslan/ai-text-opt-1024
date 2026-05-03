// Load from monorepo root .env; fall back to local .env for standalone use.
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
