/**
 * Container – wraps content in a centered, max-width box.
 * When used inside sections, add bg-white/rounded/shadow
 * on a child div to "float" the content over the background.
 */
export default function Container({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`max-w-[1200px] mx-auto px-2 md:px-4 ${className}`}>
            {children}
        </div>
    );
}
