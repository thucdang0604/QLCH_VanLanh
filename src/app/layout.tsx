import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { isAdminAvailable } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/constants";
import { getBusinessIdentity } from "@/lib/businessIdentity";
import { getCachedServerConfig } from "@/lib/serverConfig";
import FirebasePerformance from "@/components/FirebasePerformance";
import AppDialogProvider from "@/components/AppDialogProvider";
import { ThemeProvider } from "@/lib/ThemeContext";

const themeInitializationScript = `
(() => {
  try {
    const storedTheme = localStorage.getItem('qlch_theme_mode');
    const theme = storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();`;

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f97316",
};

export async function generateMetadata(): Promise<Metadata> {
  const fallbackIdentity = getBusinessIdentity();
  let title = `${fallbackIdentity.siteName} - Sửa chữa điện thoại, laptop uy tín`;
  const description = "Chuyên sửa chữa điện thoại, laptop, thay pin, ép kính chính hãng. Bảo hành trọn đời - Sửa chữa nhanh 30 phút.";

  if (isAdminAvailable()) {
    try {
      const data = await getCachedServerConfig();

      if (Object.keys(data).length > 0) {
        const identity = getBusinessIdentity(data);
        title = `${identity.siteName} - Sửa chữa điện thoại, Laptop uy tín`;
      }
    } catch {
      // Firebase Admin SDK error — dùng giá trị mặc định
    }
  }

  return {
    metadataBase: new URL(SITE_URL),
    applicationName: fallbackIdentity.siteName,
    title,
    description,
    manifest: "/manifest.webmanifest",
    keywords: ["sửa chữa điện thoại", "thay pin iPhone", "ép kính", "sửa laptop", fallbackIdentity.siteName],
    verification: {
      google: "njFEZRHzs2q-XWIRzyhDScytGVP8nfnY1anp0ZvHWKU",
    },
    appleWebApp: {
      capable: true,
      title: fallbackIdentity.siteName,
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/icons/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/pwa-icon-180.png", sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
        <meta name="zalo-platform-site-verification" content="NeUWSQoo8IzmZQqmegKTPdgmkMcMncinCZ8s" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://wsrv.nl" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://wsrv.nl" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <AuthProvider>
            <AppDialogProvider>
              {children}
              <FirebasePerformance />
            </AppDialogProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}


