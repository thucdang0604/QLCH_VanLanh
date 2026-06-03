/**
 * Request cache invalidation without invoking a Server Action from the admin UI.
 * Keeping this as a background API request prevents admin auth remounts after
 * configuration saves.
 */
export async function requestRevalidate(paths?: string[], tags?: string[]): Promise<boolean> {
    try {
        const response = await fetch('/api/revalidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths, tags }),
            credentials: 'same-origin',
        });

        if (!response.ok) {
            console.warn('Config revalidation request failed:', await response.text().catch(() => ''));
            return false;
        }

        return true;
    } catch (error) {
        console.warn('Config revalidation request failed:', error);
        return false;
    }
}
