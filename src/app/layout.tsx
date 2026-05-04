import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { getAdminDb, isAdminAvailable } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  let title = "Văn Lành Service - Sửa chữa điện thoại, laptop uy tín";
  const description = "Chuyên sửa chữa điện thoại, laptop, thay pin, ép kính chính hãng. Bảo hành trọn đời - Sửa chữa nhanh 30 phút.";

  if (isAdminAvailable()) {
    try {
      const db = getAdminDb();
      const docNames = ['main_settings', 'layout_settings', 'navigation_settings', 'taxonomy_settings'];
      const refs = docNames.map(name => db.collection('system_config').doc(name));
      const snapshots = await db.getAll(...refs);
      
      let data: any = {};
      snapshots.forEach(snap => {
          if (snap.exists) {
              const snapData = JSON.parse(JSON.stringify(snap.data()));
              data = { ...data, ...snapData };
          }
      });

      if (Object.keys(data).length > 0) {
        const siteName = data?.siteName || "Văn Lành Service";
        title = `${siteName} - Sửa chữa điện thoại, Laptop uy tín`;
      }
    } catch {
      // Firebase Admin SDK error — dùng giá trị mặc định
    }
  }

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: ["sửa chữa điện thoại", "thay pin iPhone", "ép kính", "sửa laptop", "Văn Lành"],
    verification: {
      google: "njFEZRHzs2q-XWIRzyhDScytGVP8nfnY1anp0ZvHWKU",
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
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://wsrv.nl" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://wsrv.nl" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}


