import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server with only the packages it
  // actually imports. Keeps the runtime image small, which matters on a box
  // already carrying twenty containers.
  output: 'standalone',

  images: {
    // The payload budget lives here: 400 KB listing feed, 600 KB single lot.
    formats: ['image/avif', 'image/webp'],
    // Widths a mid-range Android actually requests. The defaults go to 3840,
    // which nobody on prepaid data should ever be served.
    deviceSizes: [360, 414, 768, 1080],
    imageSizes: [64, 96, 128, 256],
  },

  // The app sits behind Caddy, which sets X-Forwarded-*. Without this, Next
  // builds absolute URLs from the container's own host and OTP links break.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
