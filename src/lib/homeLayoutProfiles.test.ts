import assert from 'node:assert/strict';
import test from 'node:test';
import type { HomeSectionItem } from './config-defaults';
import {
    cloneHomeSections,
    createHomepageLayoutProfile,
    getSectionLayoutOverride,
    getSectionColumnSpan,
    resolveSectionsForBreakpoint,
    updateHomepageLayoutProfile,
} from './homeLayoutProfiles';

const sections = (): HomeSectionItem[] => [
    { id: 'hero', component: 'hero', label: 'Banner', visible: true, order: 0, responsive: { tablet: { order: 1 } } },
    {
        id: 'categories',
        component: 'categories',
        label: 'Danh muc',
        visible: true,
        order: 1,
        responsive: {
            mobile: { visible: false, order: 2, columns: 1, spacing: 'compact' },
            tablet: { order: 0, columns: 3 },
        },
    },
];

test('uses breakpoint overrides while keeping desktop layout as the base', () => {
    const category = sections()[1];

    assert.deepEqual(getSectionLayoutOverride(category, 'desktop'), { visible: true, order: 1 });
    assert.deepEqual(getSectionLayoutOverride(category, 'mobile'), {
        visible: false,
        order: 2,
        columns: 1,
        spacing: 'compact',
    });
});

test('filters hidden modules and orders the active breakpoint deterministically', () => {
    const mobile = resolveSectionsForBreakpoint(sections(), 'mobile');
    const tablet = resolveSectionsForBreakpoint(sections(), 'tablet');

    assert.deepEqual(mobile.map((section) => section.id), ['hero']);
    assert.deepEqual(tablet.map((section) => section.id), ['categories', 'hero']);
});

test('keeps homepage blocks full width by default and safely resolves responsive spans', () => {
    const category = sections()[1];
    assert.equal(getSectionColumnSpan(category, 'desktop'), 12);

    category.responsive = {
        ...category.responsive,
        desktop: { columnSpan: 8, columns: 6, spacing: 'compact' },
        tablet: { ...category.responsive?.tablet, columnSpan: 4 },
        mobile: { ...category.responsive?.mobile, columnSpan: 99 },
    };

    assert.equal(getSectionColumnSpan(category, 'desktop'), 8);
    assert.equal(getSectionColumnSpan(category, 'tablet'), 4);
    assert.equal(getSectionColumnSpan(category, 'mobile'), 12);
    assert.deepEqual(getSectionLayoutOverride(category, 'tablet'), {
        visible: true,
        order: 0,
        columnSpan: 4,
        columns: 3,
        spacing: 'compact',
    });
    assert.deepEqual(getSectionLayoutOverride(category, 'mobile'), {
        visible: false,
        order: 2,
        columnSpan: 99,
        columns: 1,
        spacing: 'compact',
    });

    const hero = sections()[0];
    hero.responsive = {
        desktop: { columnSpan: 9, columns: 4, spacing: 'spacious' },
        tablet: { order: 3 },
    };
    assert.deepEqual(getSectionLayoutOverride(hero, 'tablet'), {
        visible: true,
        order: 3,
        columnSpan: 9,
        columns: 4,
        spacing: 'spacious',
    });
});

test('profiles clone their sections and version mutations without changing the published source', () => {
    const source = sections();
    const profile = createHomepageLayoutProfile('Tet', source, 'landing page');
    source[0].label = 'Changed outside profile';

    assert.equal(profile.homeSections[0].label, 'Banner');
    assert.equal(profile.version, 1);

    const updated = updateHomepageLayoutProfile(profile, cloneHomeSections(profile.homeSections), { name: 'Tet 2027' });
    assert.equal(updated.name, 'Tet 2027');
    assert.equal(updated.version, 2);
    assert.equal(profile.name, 'Tet');
});
