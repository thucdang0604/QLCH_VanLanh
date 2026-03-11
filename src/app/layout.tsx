import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ConfigProvider } from "@/lib/ConfigContext";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_CONFIG } from "@/lib/ConfigContext";

export async function generateMetadata(): Promise<Metadata> {
  let title = "Văn Lành Service - Sửa chữa điện thoại, laptop uy tín";
  let description = "Chuyên sửa chữa điện thoại, laptop, thay pin, ép kính chính hãng. Bảo hành trọn đời - Sửa chữa nhanh 30 phút.";

  try {
    const docRef = doc(db, 'system_config', 'main_settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      // Use config siteName as site name or fallback
      const siteName = data.siteName || "Văn Lành Service";
      title = `${siteName} - Sửa chữa điện thoại, Laptop uy tín`;
      // We could also fetch description if available in config
    }
  } catch (error) {
    console.error("Error fetching metadata:", error);
  }

  return {
    title,
    description,
    keywords: ["sửa chữa điện thoại", "thay pin iPhone", "ép kính", "sửa laptop", "Văn Lành"],
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
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <ConfigProvider>
            {children}
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


