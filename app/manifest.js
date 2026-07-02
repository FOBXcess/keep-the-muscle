export default function manifest() {
  return {
    name: "Muscle Mindset · Keep the Muscle",
    short_name: "Keep the Muscle",
    description: "Muscle protection coaching for people with suppressed appetites.",
    start_url: "/app",
    display: "standalone",
    background_color: "#0C0A07",
    theme_color: "#0C0A07",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
