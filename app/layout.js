export const metadata = {
  title: "Muscle Mindset · Keep the Muscle",
  description: "Muscle protection coaching for people with suppressed appetites.",
  appleWebApp: {
    capable: true,
    title: "Keep the Muscle",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0C0A07",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
