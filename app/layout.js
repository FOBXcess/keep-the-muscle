export const metadata = {
  title: "Muscle Mindset · Keep the Muscle",
  description: "Muscle protection coaching for people with suppressed appetites.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
