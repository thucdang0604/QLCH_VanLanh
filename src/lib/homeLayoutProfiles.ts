import type {
    HomeSectionItem,
    HomeSectionLayoutOverride,
    HomepageLayoutProfile,
    LayoutBreakpoint,
} from '@/lib/config-defaults';

export const HOMEPAGE_LAYOUT_PROFILE_LIMIT = 12;
export const HOMEPAGE_LAYOUT_COLUMN_SPANS = [12, 9, 8, 6, 4, 3] as const;

export const LAYOUT_BREAKPOINTS: Array<{ id: LayoutBreakpoint; label: string }> = [
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
];

export const GRID_SECTION_COMPONENTS = new Set<HomeSectionItem['component']>([
    'categories',
    'flash_sale',
    'suggested',
]);

export function cloneHomeSections(sections: HomeSectionItem[]): HomeSectionItem[] {
    return JSON.parse(JSON.stringify(sections)) as HomeSectionItem[];
}

export function createHomepageLayoutProfile(
    name: string,
    sections: HomeSectionItem[],
    description = '',
): HomepageLayoutProfile {
    const now = new Date().toISOString();
    return {
        id: `homepage_layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || 'Cấu hình trang chủ mới',
        description: description.trim() || undefined,
        version: 1,
        createdAt: now,
        updatedAt: now,
        homeSections: cloneHomeSections(sections),
    };
}

export function updateHomepageLayoutProfile(
    profile: HomepageLayoutProfile,
    sections: HomeSectionItem[],
    details?: Pick<HomepageLayoutProfile, 'name' | 'description'>,
): HomepageLayoutProfile {
    return {
        ...profile,
        ...details,
        version: profile.version + 1,
        updatedAt: new Date().toISOString(),
        homeSections: cloneHomeSections(sections),
    };
}

export function getSectionLayoutOverride(
    section: HomeSectionItem,
    breakpoint: LayoutBreakpoint,
): HomeSectionLayoutOverride {
    if (breakpoint === 'desktop') {
        return {
            visible: section.visible,
            order: section.order,
            ...section.responsive?.desktop,
        };
    }

    const desktop = section.responsive?.desktop;
    const override = section.responsive?.[breakpoint];
    return {
        visible: override?.visible ?? section.visible,
        order: override?.order ?? section.order,
        ...((override?.columnSpan ?? desktop?.columnSpan) === undefined
            ? {}
            : { columnSpan: override?.columnSpan ?? desktop?.columnSpan }),
        columns: override?.columns ?? desktop?.columns,
        spacing: override?.spacing ?? desktop?.spacing,
    };
}

export function getSectionColumnSpan(section: HomeSectionItem, breakpoint: LayoutBreakpoint): number {
    const requestedSpan = getSectionLayoutOverride(section, breakpoint).columnSpan;
    if (typeof requestedSpan !== 'number' || !Number.isInteger(requestedSpan)) return 12;
    return Math.min(Math.max(requestedSpan, 1), 12);
}

export function resolveSectionsForBreakpoint(
    sections: HomeSectionItem[],
    breakpoint: LayoutBreakpoint,
): HomeSectionItem[] {
    return sections
        .filter((section) => getSectionLayoutOverride(section, breakpoint).visible !== false)
        .sort((left, right) => (
            (getSectionLayoutOverride(left, breakpoint).order ?? 0)
            - (getSectionLayoutOverride(right, breakpoint).order ?? 0)
        ));
}
