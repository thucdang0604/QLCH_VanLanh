import type {
    SidebarMenuItem,
    SidebarMenuSubGroupItem,
} from './config-defaults';

/**
 * Old navigation settings stored submenu entries as labels only. Normalize
 * them in memory so an admin can migrate one entry at a time without losing
 * a saved menu before pressing Save.
 */
export function toSidebarMenuSubGroupItem(
    item: SidebarMenuSubGroupItem | string,
    fallbackId: string,
): SidebarMenuSubGroupItem {
    if (typeof item !== 'string') {
        return {
            ...item,
            id: item.id || fallbackId,
            label: item.label || item.taxonomyRef || item.slug || 'Mục menu',
        };
    }

    return {
        id: fallbackId,
        label: item,
    };
}

export function normalizeSidebarMenuItems(items: SidebarMenuItem[]): SidebarMenuItem[] {
    return items.map((item) => ({
        ...item,
        subGroups: (item.subGroups || []).map((group, groupIndex) => ({
            ...group,
            items: (group.items || []).map((subItem, itemIndex) =>
                toSidebarMenuSubGroupItem(subItem, `${item.id}_group_${groupIndex}_item_${itemIndex}`),
            ),
        })),
    }));
}

export function getSidebarMenuSubGroupItemHref(
    item: SidebarMenuSubGroupItem | string,
    parent: Pick<SidebarMenuItem, 'slug' | 'isCustomLink'>,
): string {
    const fallbackHref = parent.isCustomLink ? parent.slug : `/category/${parent.slug}`;
    if (typeof item === 'string') return fallbackHref;
    if (item.isCustomLink) return item.slug || fallbackHref;

    const taxonomyPath = item.taxonomyRef || item.slug;
    return taxonomyPath ? `/category/${taxonomyPath}` : fallbackHref;
}
