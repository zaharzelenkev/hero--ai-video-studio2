import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { 
        fs: false, 
        path: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
      };
      
      // Enable WebAssembly support
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true,
      };

      // Optimize FFmpeg chunks
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            ffmpeg: {
              test: /[\\/]node_modules[\\/]@ffmpeg[\\/]/,
              name: 'ffmpeg',
              priority: 10,
            },
          },
        },
      };
    }
    return config;
  },
  
  experimental: {
    optimizePackageImports: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
        ],
      },
      {
        source: '/ffmpeg/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
