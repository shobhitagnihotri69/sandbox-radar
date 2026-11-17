import "./globals.css";

export const metadata = {
  title: "Sandbox Radar",
  description: "Live map of AI sandbox startups: open source activity, communities, founders and hiring. Updated every 6 hours.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
