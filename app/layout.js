export const metadata = {
  title: "Muscle Mindset · Keep the Muscle",
  description: "Muscle protection coaching for people with suppressed appetites.",
  appleWebApp: {
    capable: true,
    title: "Keep the Muscle",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#0C0A07",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          overflow: "hidden",
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          overscrollBehavior: "none",
          background: "#15120E",
        }}
      >
        {children}
      </body>
    </html>
  );
}
