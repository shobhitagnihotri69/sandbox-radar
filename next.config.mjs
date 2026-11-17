/** Static export: Vercel serves plain files; the box only has to push public/data.json. */
const nextConfig = { output: "export", images: { unoptimized: true } };
export default nextConfig;
