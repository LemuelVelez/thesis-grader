/** @type {import("next").NextConfig} */
const nextConfig = {
    turbopack: {
        // Prevents Next from picking a parent folder with another lockfile.
        root: process.cwd(),
    },
};

module.exports = nextConfig;