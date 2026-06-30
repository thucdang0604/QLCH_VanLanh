import { ServerConfigProvider } from "@/lib/ConfigContext";
import { getCachedServerConfig } from "@/lib/serverConfig";
import CustomerLayoutShell from "./layout.shell";
import MissionsWidget from "@/components/MissionsWidget";

export const revalidate = 300;

/**
 * Customer Layout — Server Component
 * 
 * Fetch config 1 lần qua Admin SDK (server-side), truyền xuống client shell.
 * KHÔNG dùng onSnapshot → KHÔNG tạo WebSocket connection cho khách hàng.
 * Config chỉ cập nhật khi admin bấm Lưu → trigger revalidate.
 */

export default async function CustomerLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const config = await getCachedServerConfig();

    return (
        <ServerConfigProvider initialConfig={config}>
            <CustomerLayoutShell>
                {children}
            </CustomerLayoutShell>
            <MissionsWidget />
        </ServerConfigProvider>
    );
}
