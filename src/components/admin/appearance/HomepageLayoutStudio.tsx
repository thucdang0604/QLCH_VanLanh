'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
    Check,
    Copy,
    Eye,
    EyeOff,
    GripVertical,
    LayoutTemplate,
    Monitor,
    Play,
    Plus,
    RotateCcw,
    Save,
    Smartphone,
    Tablet,
    Trash2,
} from 'lucide-react';
import type {
    HomeSectionItem,
    HomeSectionLayoutOverride,
    HomepageLayoutProfile,
    LayoutBreakpoint,
    SiteConfig,
} from '@/lib/config-defaults';
import StorefrontDraftPreview from '@/components/admin/appearance/StorefrontDraftPreview';
import {
    GRID_SECTION_COMPONENTS,
    HOMEPAGE_LAYOUT_COLUMN_SPANS,
    HOMEPAGE_LAYOUT_PROFILE_LIMIT,
    LAYOUT_BREAKPOINTS,
    cloneHomeSections,
    createHomepageLayoutProfile,
    getSectionColumnSpan,
    getSectionLayoutOverride,
    updateHomepageLayoutProfile,
} from '@/lib/homeLayoutProfiles';

type PersistPayload = {
    layoutProfiles: HomepageLayoutProfile[];
    activeLayoutProfileId?: string;
    homeSections?: HomeSectionItem[];
};

type HomepageLayoutStudioProps = {
    profiles: HomepageLayoutProfile[];
    activeProfileId?: string;
    activeHomeSections: HomeSectionItem[];
    previewConfig: SiteConfig;
    saving: boolean;
    onPersist: (payload: PersistPayload, message: string) => Promise<boolean>;
};

const viewportIcon: Record<LayoutBreakpoint, typeof Monitor> = {
    desktop: Monitor,
    tablet: Tablet,
    mobile: Smartphone,
};

const previewDefaultColumns: Partial<Record<HomeSectionItem['component'], number>> = {
    categories: 6,
    flash_sale: 5,
    suggested: 5,
};

const sectionWidthLabels: Record<(typeof HOMEPAGE_LAYOUT_COLUMN_SPANS)[number], string> = {
    12: 'Toàn hàng · 12/12',
    9: 'Rộng · 9/12',
    8: 'Rộng · 8/12',
    6: 'Một nửa · 6/12',
    4: 'Một phần ba · 4/12',
    3: 'Một phần tư · 3/12',
};

function createWorkingProfile(profiles: HomepageLayoutProfile[], activeProfileId: string | undefined, sections: HomeSectionItem[]) {
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    const source = activeProfile || profiles[0];
    if (source) {
        return {
            profile: { ...source, homeSections: cloneHomeSections(source.homeSections) },
            sourceProfileId: source.id,
        };
    }

    return {
        profile: createHomepageLayoutProfile('Cấu hình trang chủ hiện tại', sections),
        sourceProfileId: undefined,
    };
}

function getBreakpointOrder(section: HomeSectionItem, breakpoint: LayoutBreakpoint) {
    return getSectionLayoutOverride(section, breakpoint).order ?? section.order;
}

function getDraftLayoutValue(section: HomeSectionItem, breakpoint: LayoutBreakpoint) {
    return getSectionLayoutOverride(section, breakpoint);
}

function cloneSectionWithLayout(
    section: HomeSectionItem,
    breakpoint: LayoutBreakpoint,
    partial: Partial<HomeSectionLayoutOverride>,
): HomeSectionItem {
    if (breakpoint === 'desktop') {
        const { visible, order, ...desktopStyle } = partial;
        const responsive = { ...(section.responsive || {}) };
        const existingDesktop = responsive.desktop || {};
        const nextDesktop = { ...existingDesktop, ...desktopStyle };

        if (Object.keys(nextDesktop).length > 0) responsive.desktop = nextDesktop;
        else delete responsive.desktop;

        return {
            ...section,
            ...(visible === undefined ? {} : { visible }),
            ...(order === undefined ? {} : { order }),
            responsive: Object.keys(responsive).length > 0 ? responsive : undefined,
        };
    }

    const responsive = { ...(section.responsive || {}) };
    responsive[breakpoint] = { ...(responsive[breakpoint] || {}), ...partial };
    return { ...section, responsive };
}

function resetBreakpointOverride(section: HomeSectionItem, breakpoint: LayoutBreakpoint): HomeSectionItem {
    if (breakpoint === 'desktop') return section;
    const responsive = { ...(section.responsive || {}) };
    delete responsive[breakpoint];
    return { ...section, responsive: Object.keys(responsive).length > 0 ? responsive : undefined };
}

export default function HomepageLayoutStudio({
    profiles,
    activeProfileId,
    activeHomeSections,
    previewConfig,
    saving,
    onPersist,
}: HomepageLayoutStudioProps) {
    const initial = createWorkingProfile(profiles, activeProfileId, activeHomeSections);
    const [draftProfile, setDraftProfile] = useState<HomepageLayoutProfile>(initial.profile);
    const [sourceProfileId, setSourceProfileId] = useState<string | undefined>(initial.sourceProfileId);
    const [breakpoint, setBreakpoint] = useState<LayoutBreakpoint>('desktop');
    const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const profileSignature = profiles.map((profile) => `${profile.id}:${profile.updatedAt}:${profile.version}`).join('|');
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    const sourceProfile = profiles.find((profile) => profile.id === sourceProfileId);
    const isSourceActive = Boolean(sourceProfileId && sourceProfileId === activeProfileId);
    const orderedSections = useMemo(() => (
        [...draftProfile.homeSections].sort((left, right) => (
            getBreakpointOrder(left, breakpoint) - getBreakpointOrder(right, breakpoint)
        ))
    ), [breakpoint, draftProfile.homeSections]);

    useEffect(() => {
        if (isDirty) return;
        const next = createWorkingProfile(profiles, activeProfileId, activeHomeSections);
        setDraftProfile(next.profile);
        setSourceProfileId(next.sourceProfileId);
    // Keep the editor in sync only when it has no unsaved local changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileSignature, activeProfileId, activeHomeSections, isDirty]);

    const updateDraft = (nextSections: HomeSectionItem[]) => {
        setDraftProfile((current) => ({ ...current, homeSections: nextSections }));
        setIsDirty(true);
        setNotice(null);
    };

    const updateSection = (sectionId: string, callback: (section: HomeSectionItem) => HomeSectionItem) => {
        updateDraft(draftProfile.homeSections.map((section) => section.id === sectionId ? callback(section) : section));
    };

    const updateSectionLayout = (sectionId: string, partial: Partial<HomeSectionLayoutOverride>) => {
        updateSection(sectionId, (section) => cloneSectionWithLayout(section, breakpoint, partial));
    };

    const reorder = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const reordered = [...orderedSections];
        const fromIndex = reordered.findIndex((section) => section.id === fromId);
        const toIndex = reordered.findIndex((section) => section.id === toId);
        if (fromIndex < 0 || toIndex < 0) return;

        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        const orderById = new Map(reordered.map((section, index) => [section.id, index]));
        updateDraft(draftProfile.homeSections.map((section) => (
            cloneSectionWithLayout(section, breakpoint, { order: orderById.get(section.id) ?? section.order })
        )));
    };

    const beginNewDraft = () => {
        if (isDirty && !window.confirm('Bản nháp hiện tại chưa được lưu. Tạo bản mới và bỏ thay đổi này?')) return;
        const profile = createHomepageLayoutProfile('Cấu hình trang chủ mới', activeHomeSections);
        setDraftProfile(profile);
        setSourceProfileId(undefined);
        setIsDirty(true);
        setNotice('Đang tạo cấu hình mới từ layout đang phát hành.');
    };

    const selectProfile = (profileId: string) => {
        if (profileId === sourceProfileId) return;
        if (isDirty && !window.confirm('Bản nháp hiện tại chưa được lưu. Chuyển cấu hình và bỏ thay đổi này?')) return;
        const selected = profiles.find((profile) => profile.id === profileId);
        if (!selected) return;
        setDraftProfile({ ...selected, homeSections: cloneHomeSections(selected.homeSections) });
        setSourceProfileId(selected.id);
        setIsDirty(false);
        setNotice(selected.id === activeProfileId ? 'Đang xem cấu hình đang phát hành. Lưu thay đổi sẽ tự tạo bản nháp mới.' : null);
    };

    const resetDraft = () => {
        const source = profiles.find((profile) => profile.id === sourceProfileId);
        if (source) {
            setDraftProfile({ ...source, homeSections: cloneHomeSections(source.homeSections) });
            setIsDirty(false);
            setNotice('Đã hoàn tác về cấu hình đã lưu.');
            return;
        }
        const profile = createHomepageLayoutProfile('Cấu hình trang chủ hiện tại', activeHomeSections);
        setDraftProfile(profile);
        setIsDirty(false);
        setNotice('Đã hoàn tác về layout đang phát hành.');
    };

    const prepareProfileForPersistence = () => {
        const isNew = !sourceProfile;
        const needsFork = isNew || sourceProfile.id === activeProfileId;
        if (needsFork) {
            const name = sourceProfile && draftProfile.name === sourceProfile.name
                ? `${draftProfile.name} - bản nháp`
                : draftProfile.name;
            return {
                profile: createHomepageLayoutProfile(name, draftProfile.homeSections, draftProfile.description || ''),
                replacesSource: false,
            };
        }

        return {
            profile: updateHomepageLayoutProfile(sourceProfile, draftProfile.homeSections, {
                name: draftProfile.name.trim() || sourceProfile.name,
                description: draftProfile.description,
            }),
            replacesSource: true,
        };
    };

    const saveDraft = async (apply = false) => {
        if (apply && isSourceActive && !isDirty) {
            setNotice('Cấu hình này đang được phát hành và chưa có thay đổi mới.');
            return;
        }

        const prepared = prepareProfileForPersistence();
        const isNewProfile = !prepared.replacesSource;
        if (isNewProfile && profiles.length >= HOMEPAGE_LAYOUT_PROFILE_LIMIT) {
            setNotice(`Chỉ có thể lưu tối đa ${HOMEPAGE_LAYOUT_PROFILE_LIMIT} cấu hình. Hãy xoá hoặc thay thế cấu hình cũ.`);
            return;
        }

        const nextProfiles = prepared.replacesSource
            ? profiles.map((profile) => profile.id === prepared.profile.id ? prepared.profile : profile)
            : [...profiles, prepared.profile];
        const didPersist = await onPersist(
            {
                layoutProfiles: nextProfiles,
                ...(apply ? {
                    activeLayoutProfileId: prepared.profile.id,
                    homeSections: cloneHomeSections(prepared.profile.homeSections),
                } : { activeLayoutProfileId: activeProfileId }),
            },
            apply
                ? `Đã áp dụng cấu hình “${prepared.profile.name}” cho trang chủ.`
                : `Đã lưu bản nháp “${prepared.profile.name}”. Website chưa thay đổi.`,
        );

        if (!didPersist) return;
        setDraftProfile(prepared.profile);
        setSourceProfileId(prepared.profile.id);
        setIsDirty(false);
        setNotice(apply ? 'Cấu hình này đang được phát hành.' : 'Bản nháp đã được lưu, chưa áp dụng cho website.');
    };

    const deleteProfile = async () => {
        if (!sourceProfile) return;
        if (sourceProfile.id === activeProfileId) {
            setNotice('Không thể xoá cấu hình đang phát hành. Hãy áp dụng cấu hình khác trước.');
            return;
        }
        if (!window.confirm(`Xóa cấu hình “${sourceProfile.name}”? Hành động này không thể hoàn tác.`)) return;

        const didPersist = await onPersist({
            layoutProfiles: profiles.filter((profile) => profile.id !== sourceProfile.id),
            activeLayoutProfileId: activeProfileId,
        }, `Đã xoá cấu hình “${sourceProfile.name}”.`);
        if (!didPersist) return;

        const next = createWorkingProfile(profiles.filter((profile) => profile.id !== sourceProfile.id), activeProfileId, activeHomeSections);
        setDraftProfile(next.profile);
        setSourceProfileId(next.sourceProfileId);
        setIsDirty(false);
        setNotice(null);
    };

    const duplicateProfile = () => {
        const duplicate = createHomepageLayoutProfile(`${draftProfile.name} - bản sao`, draftProfile.homeSections, draftProfile.description || '');
        setDraftProfile(duplicate);
        setSourceProfileId(undefined);
        setIsDirty(true);
        setNotice('Bản sao đang ở chế độ nháp. Lưu để thêm vào thư viện cấu hình.');
    };

    const applyHeroCompanionSplit = (
        companionComponent: Extract<HomeSectionItem['component'], 'categories' | 'articles'>,
        companionLabel: string,
        heroSpan: number,
        companionSpan: number,
    ) => {
        const hero = draftProfile.homeSections.find((section) => section.component === 'hero');
        const companion = draftProfile.homeSections.find((section) => section.component === companionComponent);
        if (!hero || !companion) {
            setNotice(`Không tìm thấy Banner chính hoặc ${companionLabel} để tạo bố cục mẫu.`);
            return;
        }

        const orderedIds = [hero.id, companion.id, ...orderedSections
            .filter((section) => section.id !== hero.id && section.id !== companion.id)
            .map((section) => section.id)];
        const orderById = new Map(orderedIds.map((id, index) => [id, index]));

        updateDraft(draftProfile.homeSections.map((section) => cloneSectionWithLayout(section, breakpoint, {
            order: orderById.get(section.id) ?? section.order,
            ...(section.id === hero.id ? { columnSpan: heroSpan } : {}),
            ...(section.id === companion.id ? { columnSpan: companionSpan } : {}),
            ...(section.id !== hero.id && section.id !== companion.id ? { columnSpan: 12 } : {}),
        })));
        setNotice(`Đã đặt Banner ${heroSpan}/12 và ${companionLabel} ${companionSpan}/12 cùng một hàng trong bản nháp.`);
    };

    const applyHeroCategoriesSplit = () => applyHeroCompanionSplit('categories', 'Danh mục', 8, 4);
    const applyHeroArticlesSplit = () => applyHeroCompanionSplit('articles', 'Bài viết', 9, 3);

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-orange-900">
                <div className="flex gap-3">
                    <LayoutTemplate className="mt-0.5 shrink-0 text-orange-600" size={20} />
                    <div>
                        <p className="font-semibold">Layout Studio hoạt động bằng bản nháp</p>
                        <p className="mt-1 text-xs leading-5 text-orange-800">Kéo thả, chọn độ rộng khối, đổi breakpoint và preview chỉ thay đổi trong editor này. Trang khách chỉ đổi sau khi bấm <strong>Áp dụng</strong>.</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="min-w-0 flex-1 text-xs font-semibold text-gray-600">
                                Cấu hình
                                <select
                                    value={sourceProfileId || ''}
                                    onChange={(event) => selectProfile(event.target.value)}
                                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:border-orange-500"
                                >
                                    {profiles.length === 0 && <option value="">Chưa có cấu hình đã lưu</option>}
                                    {profiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}{profile.id === activeProfileId ? ' — đang áp dụng' : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={beginNewDraft} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
                                    <Plus size={15} /> Mới
                                </button>
                                <button type="button" onClick={duplicateProfile} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
                                    <Copy size={15} /> Nhân bản
                                </button>
                                <button type="button" onClick={resetDraft} disabled={!isDirty} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45">
                                    <RotateCcw size={15} /> Hoàn tác
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                            <label className="text-xs font-semibold text-gray-600">
                                Tên cấu hình
                                <input value={draftProfile.name} onChange={(event) => { setDraftProfile((current) => ({ ...current, name: event.target.value })); setIsDirty(true); }} className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none focus:border-orange-500" maxLength={60} />
                            </label>
                            <label className="text-xs font-semibold text-gray-600">
                                Ghi chú nội bộ
                                <input value={draftProfile.description || ''} onChange={(event) => { setDraftProfile((current) => ({ ...current, description: event.target.value || undefined })); setIsDirty(true); }} className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none focus:border-orange-500" maxLength={120} placeholder="Ví dụ: Ưu đãi đầu tháng" />
                            </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className={isDirty ? 'font-semibold text-amber-700' : 'font-medium text-emerald-700'}>
                                {isDirty ? 'Có thay đổi chưa lưu' : 'Bản nháp đã đồng bộ'}
                            </span>
                            {activeProfile && <span className="text-gray-500">Đang phát hành: <strong className="text-gray-700">{activeProfile.name}</strong></span>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h4 className="font-semibold text-gray-800">Bố cục theo thiết bị</h4>
                                <p className="mt-0.5 text-xs text-gray-500">Desktop là layout gốc; Tablet/Mobile chỉ lưu phần ghi đè.</p>
                            </div>
                            <div className="inline-flex rounded-lg bg-gray-100 p-1">
                                {LAYOUT_BREAKPOINTS.map(({ id, label }) => {
                                    const Icon = viewportIcon[id];
                                    const selected = breakpoint === id;
                                    return (
                                        <button key={id} type="button" onClick={() => setBreakpoint(id)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${selected ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                            <Icon size={14} /> {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[11px] leading-4 text-slate-600">Các khối liền kề có tổng 12 cột sẽ nằm chung một hàng. Ví dụ: Banner 8/12 + Danh mục 4/12.</p>
                            {breakpoint !== 'mobile' ? (
                                <div className="flex flex-wrap gap-1.5">
                                    <button type="button" onClick={applyHeroCategoriesSplit} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-50">
                                        <LayoutTemplate size={13} /> Mẫu Banner + Danh mục
                                    </button>
                                    <button type="button" onClick={applyHeroArticlesSplit} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-50">
                                        <LayoutTemplate size={13} /> Mẫu Banner + Bài viết
                                    </button>
                                </div>
                            ) : <span className="text-[11px] font-medium text-slate-500">Mobile nên dùng 12/12 để xếp dọc.</span>}
                        </div>

                        <div className="mt-4 space-y-2">
                            {orderedSections.map((section) => {
                                const layout = getDraftLayoutValue(section, breakpoint);
                                const isGrid = GRID_SECTION_COMPONENTS.has(section.component);
                                const isVisible = layout.visible !== false;
                                return (
                                    <div
                                        key={section.id}
                                        draggable
                                        onDragStart={(event: DragEvent<HTMLDivElement>) => { setDraggedSectionId(section.id); event.dataTransfer.effectAllowed = 'move'; }}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => { event.preventDefault(); if (draggedSectionId) reorder(draggedSectionId, section.id); setDraggedSectionId(null); }}
                                        onDragEnd={() => setDraggedSectionId(null)}
                                        className={`rounded-lg border p-3 transition ${draggedSectionId === section.id ? 'border-orange-400 bg-orange-50 opacity-70' : 'border-gray-200 bg-white'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <GripVertical size={18} className="cursor-grab text-gray-400 active:cursor-grabbing" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-gray-800">{section.label}</p>
                                                <p className="text-[11px] text-gray-500">{section.component} · {getSectionColumnSpan(section, breakpoint)}/12</p>
                                            </div>
                                            <button type="button" onClick={() => updateSectionLayout(section.id, { visible: !isVisible })} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${isVisible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`} aria-label={isVisible ? `Ẩn ${section.label}` : `Hiện ${section.label}`} title={isVisible ? 'Ẩn ở breakpoint này' : 'Hiện ở breakpoint này'}>
                                                {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                                            </button>
                                        </div>

                                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                                            <label className="text-[11px] font-medium text-gray-500">
                                                Khoảng cách
                                                <select value={layout.spacing || 'comfortable'} onChange={(event) => updateSectionLayout(section.id, { spacing: event.target.value as HomeSectionLayoutOverride['spacing'] })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-700">
                                                    <option value="compact">Gọn</option>
                                                    <option value="comfortable">Vừa</option>
                                                    <option value="spacious">Rộng</option>
                                                </select>
                                            </label>
                                            <label className="text-[11px] font-medium text-gray-500">
                                                Độ rộng khối
                                                <select value={getSectionColumnSpan(section, breakpoint)} onChange={(event) => updateSectionLayout(section.id, { columnSpan: Number(event.target.value) })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-700">
                                                    {HOMEPAGE_LAYOUT_COLUMN_SPANS.map((span) => <option key={span} value={span}>{sectionWidthLabels[span]}</option>)}
                                                </select>
                                            </label>
                                            {isGrid ? (
                                                <label className="text-[11px] font-medium text-gray-500">
                                                    Số cột
                                                    <select value={layout.columns || previewDefaultColumns[section.component] || 2} onChange={(event) => updateSectionLayout(section.id, { columns: Number(event.target.value) })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-700">
                                                        {[1, 2, 3, 4, 5, 6].map((columns) => <option key={columns} value={columns}>{columns} cột</option>)}
                                                    </select>
                                                </label>
                                            ) : <div className="hidden sm:block" />}
                                            {breakpoint !== 'desktop' ? (
                                                <button type="button" onClick={() => updateSection(section.id, (current) => resetBreakpointOverride(current, breakpoint))} className="mt-auto inline-flex h-8 items-center justify-center gap-1 rounded border border-gray-200 px-2 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50">
                                                    <RotateCcw size={13} /> Kế thừa desktop
                                                </button>
                                            ) : <div className="hidden sm:block" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">
                            {isSourceActive && <span>Đang chỉnh cấu hình phát hành — lưu sẽ tạo <strong>bản nháp mới</strong> để bảo vệ website.</span>}
                            {!isSourceActive && sourceProfile && <span>Bản nháp này không thay đổi website cho đến khi áp dụng.</span>}
                            {!sourceProfile && <span>Bản nháp chưa tồn tại trong thư viện.</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {sourceProfile && sourceProfile.id !== activeProfileId && (
                                <button type="button" onClick={deleteProfile} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                                    <Trash2 size={15} /> Xóa
                                </button>
                            )}
                            <button type="button" onClick={() => saveDraft(false)} disabled={saving || !isDirty} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                                <Save size={15} /> Lưu bản nháp
                            </button>
                            <button type="button" onClick={() => saveDraft(true)} disabled={saving || (isSourceActive && !isDirty)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                                {saving ? <Check size={15} className="animate-pulse" /> : <Play size={15} />} Áp dụng
                            </button>
                        </div>
                    </div>
                    {notice && <p aria-live="polite" className="text-xs font-medium text-orange-700">{notice}</p>}
                </div>

                <div className="xl:sticky xl:top-20 xl:self-start">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold text-gray-800">Preview trực quan</h4>
                                <p className="mt-0.5 text-xs text-gray-500">Canvas storefront thật từ bản nháp; không ghi lên website.</p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Live canvas</span>
                        </div>
                        <StorefrontDraftPreview config={previewConfig} homeSections={draftProfile.homeSections} breakpoint={breakpoint} />
                    </div>
                </div>
            </div>
        </div>
    );
}
