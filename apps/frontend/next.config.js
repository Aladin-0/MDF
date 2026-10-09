const path = require('path');
const withSerwist = require('@serwist/next').default({
    swSrc: 'app/sw.ts',
    swDest: 'public/sw.js',
    disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: process.env.PLAYWRIGHT_TEST ? '.next-test' : '.next',
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
    transpilePackages: ['@mediflow/constants'],
    webpack: (config) => {
        config.resolve.modules = [
            ...(config.resolve.modules ?? ['node_modules']),
            path.resolve(__dirname, '../../node_modules'),
        ];
        return config;
    },
    async redirects() {
        return [
            {
                source: '/dashboard/billing',
                destination: '/billing',
                permanent: true,
            },
            {
                source: '/dashboard/billing/:path*',
                destination: '/billing/:path*',
                permanent: true,
            },
        ];
    },
};

module.exports = withSerwist(nextConfig);
