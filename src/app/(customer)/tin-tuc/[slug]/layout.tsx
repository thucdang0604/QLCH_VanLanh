export default function ArticleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

export const revalidate = 30;
