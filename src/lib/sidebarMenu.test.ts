import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getSidebarMenuSubGroupItemHref,
    normalizeSidebarMenuItems,
} from './sidebarMenu';

test('sidebar submenu item uses its taxonomy path instead of the parent category', () => {
    const href = getSidebarMenuSubGroupItemHref(
        {
            id: 'iphone-16',
            label: 'iPhone 16',
            taxonomyRef: 'dien-thoai/iphone/iphone-16',
        },
        { slug: 'dien-thoai', isCustomLink: false },
    );

    assert.equal(href, '/category/dien-thoai/iphone/iphone-16');
});

test('legacy text-only submenu item retains its parent destination until an admin maps it', () => {
    assert.equal(
        getSidebarMenuSubGroupItemHref('iPhone 15 Pro', { slug: 'sua-iphone', isCustomLink: false }),
        '/category/sua-iphone',
    );
});

test('sidebar submenu item supports a direct collection link', () => {
    assert.equal(
        getSidebarMenuSubGroupItemHref(
            {
                id: 'may-cu-99',
                label: 'Máy cũ 99%',
                slug: '/category/may-cu-99',
                isCustomLink: true,
            },
            { slug: 'dien-thoai', isCustomLink: false },
        ),
        '/category/may-cu-99',
    );
});

test('normalization preserves legacy labels while giving them stable editable IDs', () => {
    const [menu] = normalizeSidebarMenuItems([{
        id: 'sidebar-repair',
        name: 'Sửa chữa',
        slug: 'sua-chua',
        iconName: 'Wrench',
        order: 0,
        visible: true,
        subGroups: [{ group: 'Dòng máy', items: ['iPhone 16'] }],
    }]);

    const [item] = menu.subGroups[0].items;
    assert.deepEqual(item, {
        id: 'sidebar-repair_group_0_item_0',
        label: 'iPhone 16',
    });
});
