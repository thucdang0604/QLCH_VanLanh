'use client';

import { useState, useEffect } from 'react';
import {
    Plus, Check, Loader2, MoreVertical,
    Edit, Mail, Phone, Search
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { AppUser } from '@/lib/AuthContext';
import { toastError, toastSuccess } from '@/lib/toast';
import { ADMIN_ROLE_PRESETS, PERMISSIONS_REGISTRY as PERMISSIONS } from '@/lib/adminModules';
import {
    CATALOG_FIELD_PERMISSION_GROUPS,
    type CatalogFieldPermissions,
    type CatalogPermissionScope,
} from '@/lib/catalogEditPolicy';

// Using centralized PERMISSIONS from @/lib/permissions
export default function StaffPage() {
    const [staffs, setStaffs] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);

    // Add Staff Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchEmail, setSearchEmail] = useState('');
    const [foundUser, setFoundUser] = useState<AppUser | null>(null);
    const [searching, setSearching] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        email: '',
        displayName: '',
        phone: '',
        password: '', // Only for creation
        role: 'staff',
        permissions: [] as string[],
        catalogFieldPermissions: {} as CatalogFieldPermissions,
    });

    const [processing, setProcessing] = useState(false);

    const fetchStaffs = async () => {
        try {
            const q = query(collection(db, 'users'), where('role', 'in', ['staff', 'admin']));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as AppUser[];
            setStaffs(data);
        } catch (error) {
            console.error('Error fetching staffs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStaffs();
    }, []);

    const resetForm = () => {
        setFormData({
            email: '',
            displayName: '',
            phone: '',
            password: '',
            role: 'staff',
            permissions: [],
            catalogFieldPermissions: {},
        });
        setEditingUser(null);
    };

    const handleOpenModal = (user?: AppUser) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                email: user.email || '',
                displayName: user.displayName || '',
                phone: user.phone || '',
                password: '',
                role: user.role,
                permissions: user.permissions || [],
                catalogFieldPermissions: user.catalogFieldPermissions || {},
            });
        } else {
            resetForm();
        }
        setShowModal(true);
    };

    const togglePermission = (permId: string) => {
        setFormData(prev => {
            const isRemoving = prev.permissions.includes(permId);
            const perms = isRemoving
                ? prev.permissions.filter(p => p !== permId)
                : [...prev.permissions, permId];
            const group = CATALOG_FIELD_PERMISSION_GROUPS.find((item) => item.modulePermission === permId);
            const catalogFieldPermissions = { ...prev.catalogFieldPermissions };
            if (isRemoving && group) delete catalogFieldPermissions[group.scope];
            return { ...prev, permissions: perms, catalogFieldPermissions };
        });
    };

    const applyPreset = (permissions: readonly string[]) => {
        setFormData(prev => ({ ...prev, permissions: [...permissions], catalogFieldPermissions: {} }));
    };

    const toggleCatalogFieldPermission = (scope: CatalogPermissionScope, field: string) => {
        setFormData(prev => {
            const current = prev.catalogFieldPermissions[scope] || [];
            const next = current.includes(field)
                ? current.filter((item) => item !== field)
                : [...current, field];
            return {
                ...prev,
                catalogFieldPermissions: {
                    ...prev.catalogFieldPermissions,
                    [scope]: next,
                },
            };
        });
    };

    const isPresetSelected = (permissions: readonly string[]) => (
        formData.permissions.length === permissions.length &&
        permissions.every(permission => formData.permissions.includes(permission))
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);

        try {
            if (editingUser) {
                // Update existing user
                const userRef = doc(db, 'users', editingUser.uid);
                await updateDoc(userRef, {
                    displayName: formData.displayName,
                    phone: formData.phone,
                    role: formData.role,
                    permissions: formData.permissions,
                    catalogFieldPermissions: formData.catalogFieldPermissions,
                });
                toastSuccess('Cập nhật nhân viên thành công!');
            } else {
                // Create new user
                // Note: Client-side creation has limitations. Ideally use Firebase Admin SDK via API Route.
                // For now, we will just create the Firestore document and assume the Auth user is created separately 
                // or guide the user to sign up first.
                // BUT, to make it work seamlessly, we should probably use a secondary app instance or an API route.
                // Given the constraints, let's just alert the limitation.

                toastError('Tính năng tạo tài khoản trực tiếp cần API Backend (Firebase Admin SDK). Hiện tại vui lòng yêu cầu nhân viên Đăng ký tài khoản trước, sau đó Admin vào đây cấp quyền.');

                // However, we CAN update permissions if we search by email.
                // Let's implement searching for existing customer to promote to staff.
                return;
            }

            setShowModal(false);
            fetchStaffs();
        } catch (error) {
            console.error('Error saving staff:', error);
            toastError('Có lỗi xảy ra!');
        } finally {
            setProcessing(false);
        }
    };

    // Promote Customer to Staff Logic
    const handleSearchUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchEmail.trim()) return;

        setSearching(true);
        setFoundUser(null);

        try {
            // Query by email
            const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim()));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const userDoc = snapshot.docs[0];
                setFoundUser({ uid: userDoc.id, ...userDoc.data() } as AppUser);
            } else {
                toastError('Không tìm thấy tài khoản với email này. Vui lòng đảm bảo nhân viên đã đăng nhập bằng Google ít nhất 1 lần.');
            }
        } catch (error) {
            console.error('Error searching user:', error);
            toastError('Lỗi khi tìm kiếm');
        } finally {
            setSearching(false);
        }
    };

    const handlePromoteClick = () => {
        if (!foundUser) return;
        setShowAddModal(false);
        handleOpenModal(foundUser); // Open edit modal with found user
        setSearchEmail('');
        setFoundUser(null);
    };

    if (loading) return <div className="p-8"><Loader2 className="animate-spin text-orange-500" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Quản lý Nhân viên</h1>
                    <p className="text-gray-500">Phân quyền và quản lý tài khoản nhân viên</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                    <Plus size={20} />
                    Thêm nhân viên
                </button>
            </div>

            {/* Staff List — Desktop Table */}
            <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                            <th className="px-4 py-3">Nhân viên</th>
                            <th className="px-4 py-3">Liên hệ</th>
                            <th className="px-4 py-3">Phân quyền</th>
                            <th className="px-4 py-3 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {staffs.map((staff) => (
                            <tr key={staff.uid} className="hover:bg-gray-50 transition-colors duration-200">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold shrink-0">
                                            {staff.displayName?.[0] || 'U'}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium text-gray-900 line-clamp-1">{staff.displayName}</div>
                                            <div className="text-xs text-gray-500 truncate">RID: {staff.uid.slice(0, 8)}...</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="space-y-1 text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Mail size={14} />
                                            {staff.email}
                                        </div>
                                        {staff.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} />
                                                {staff.phone}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="space-y-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${staff.role === 'admin'
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-blue-100 text-blue-800'
                                            }`}>
                                            {staff.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {staff.role === 'admin' ? (
                                                <span className="text-[11px] text-gray-400 italic">Toàn quyền hệ thống</span>
                                            ) : (
                                                staff.permissions?.map(perm => {
                                                    const label = PERMISSIONS.find(p => p.id === perm)?.label || perm;
                                                    return (
                                                        <span key={perm} className="inline-flex px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] border border-gray-200">
                                                            {label}
                                                        </span>
                                                    );
                                                })
                                            )}
                                            {staff.role !== 'admin' && (!staff.permissions || staff.permissions.length === 0) && (
                                                <span className="text-[11px] text-gray-400 italic">Chưa cấp quyền</span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        title="Chỉnh sửa nhân viên"
                                        onClick={() => handleOpenModal(staff)}
                                        className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all active:scale-95"
                                    >
                                        <Edit size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Staff List — Mobile Cards */}
            <div className="lg:hidden space-y-3">
                {staffs.map((staff) => (
                    <div key={staff.uid} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 transition-all duration-200 hover:shadow-md">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold shrink-0">
                                    {staff.displayName?.[0] || 'U'}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-semibold text-gray-900">{staff.displayName}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${staff.role === 'admin'
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-blue-100 text-blue-800'
                                            }`}>
                                            {staff.role === 'admin' ? 'Admin' : 'NV'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                title="Chỉnh sửa nhân viên"
                                onClick={() => handleOpenModal(staff)}
                                className="p-2 text-blue-600 hover:bg-blue-50 bg-blue-50/50 rounded-lg transition-all active:scale-95 shrink-0"
                            >
                                <Edit size={18} />
                            </button>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <Mail size={13} className="text-gray-400 shrink-0" />
                                <span className="truncate">{staff.email}</span>
                            </div>
                            {staff.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone size={13} className="text-gray-400 shrink-0" />
                                    <span>{staff.phone}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                            {staff.role === 'admin' ? (
                                <span className="text-xs text-gray-400 italic">Toàn quyền hệ thống</span>
                            ) : (
                                staff.permissions?.map(perm => {
                                    const label = PERMISSIONS.find(p => p.id === perm)?.label || perm;
                                    return (
                                        <span key={perm} className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] border border-gray-200">
                                            {label}
                                        </span>
                                    );
                                })
                            )}
                            {staff.role !== 'admin' && (!staff.permissions || staff.permissions.length === 0) && (
                                <span className="text-xs text-gray-400 italic">Chưa cấp quyền</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Staff Search Modal */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Thêm nhân viên" size="md">

                        <div className="p-6 space-y-6">
                            <p className="text-sm text-gray-600">
                                Tìm kiếm tài khoản đã đăng ký (qua Google) để cấp quyền nhân viên.
                            </p>

                            <form onSubmit={handleSearchUser} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email nhân viên</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            required
                                            value={searchEmail}
                                            onChange={e => setSearchEmail(e.target.value)}
                                            placeholder="nguyenvan@gmail.com"
                                            className="flex-1 px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                        />
                                        <button
                                            type="submit"
                                            disabled={searching}
                                            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-70"
                                        >
                                            {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </form>

                            {/* Search Result */}
                            {foundUser && (
                                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 animate-[fadeIn_0.2s_ease]">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-orange-600 font-bold shadow-sm">
                                            {foundUser.displayName?.[0] || 'U'}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{foundUser.displayName}</div>
                                            <div className="text-xs text-gray-500">{foundUser.email}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${foundUser.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                foundUser.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-gray-200 text-gray-600'
                                            }`}>
                                            Hiện tại: {foundUser.role || 'customer'}
                                        </span>

                                        <button
                                            onClick={handlePromoteClick}
                                            className="text-sm font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                        >
                                            Cấp quyền
                                            <MoreVertical size={16} className="rotate-90" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingUser ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'} size="2xl">

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                                    <input
                                        title="Họ tên"
                                        type="text"
                                        value={formData.displayName}
                                        onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                        disabled={!editingUser} // Can't edit name if not editing (mock restriction)
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        title="Email"
                                        type="email"
                                        value={formData.email}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg bg-gray-50 text-gray-500"
                                        disabled
                                    />
                                </div>
                            </div>

                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Vai trò</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            title="Vai trò"
                                            type="radio"
                                            name="role"
                                            value="staff"
                                            checked={formData.role === 'staff'}
                                            onChange={() => setFormData({ ...formData, role: 'staff' })}
                                            className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                                        />
                                        <span className="text-sm text-gray-700">Nhân viên</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            title="Vai trò"
                                            type="radio"
                                            name="role"
                                            value="admin"
                                            checked={formData.role === 'admin'}
                                            onChange={() => setFormData({ ...formData, role: 'admin' })}
                                            className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                                        />
                                        <span className="text-sm text-gray-700">Quản trị viên (Toàn quyền)</span>
                                    </label>
                                </div>
                            </div>

                            {/* Permissions Matrix - Only show if role is Staff */}
                            {formData.role === 'staff' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">Phân quyền</label>
                                    <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                                        Quyền chức năng cho phép nhân viên bổ sung trường đang thiếu. Muốn sửa dữ liệu đã có, admin cấp thêm từng trường ở phần bên dưới. Nguồn cung cấp chỉ điền một lần và số lượng tồn kho chỉ thay đổi qua nhập kho hoặc kiểm kê.
                                    </p>
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <p className="text-sm font-medium text-gray-700">Preset vai trò</p>
                                            <p className="text-xs text-gray-400">Chọn preset sẽ thay thế quyền hiện tại</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {ADMIN_ROLE_PRESETS.map((preset) => {
                                                const selected = isPresetSelected(preset.permissions);

                                                return (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        onClick={() => applyPreset(preset.permissions)}
                                                        className={`text-left p-3 rounded-lg border transition-all ${selected
                                                            ? 'bg-orange-50 border-orange-200 text-orange-700'
                                                            : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm font-semibold">{preset.label}</span>
                                                            {selected && <Check size={14} />}
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">{preset.description}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {PERMISSIONS.map((perm) => (
                                            <label
                                                key={perm.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.permissions.includes(perm.id)
                                                    ? 'bg-orange-50 border-orange-200'
                                                    : 'bg-white border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.permissions.includes(perm.id)
                                                    ? 'bg-orange-500 border-orange-500 text-white'
                                                    : 'bg-white border-gray-300'
                                                    }`}>
                                                    {formData.permissions.includes(perm.id) && <Check size={12} />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={formData.permissions.includes(perm.id)}
                                                    onChange={() => togglePermission(perm.id)}
                                                />
                                                <span className="text-sm font-medium text-gray-700">{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {CATALOG_FIELD_PERMISSION_GROUPS.some((group) => formData.permissions.includes(group.modulePermission)) && (
                                        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                                            <p className="text-sm font-semibold text-blue-900">Quyền sửa dữ liệu đã có</p>
                                            <p className="mt-1 text-xs leading-5 text-blue-800">
                                                Mặc định nhân viên chỉ bổ sung ô trống. Tick trường bên dưới để cho phép sửa cả dữ liệu đã có. Nguồn cung cấp và số lượng tồn kho không thể cấp quyền sửa.
                                            </p>
                                            <div className="mt-4 space-y-4">
                                                {CATALOG_FIELD_PERMISSION_GROUPS
                                                    .filter((group) => formData.permissions.includes(group.modulePermission))
                                                    .map((group) => (
                                                        <div key={group.scope} className="rounded-lg border border-blue-100 bg-white p-3">
                                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-800">{group.title}</p>
                                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                {group.fields.map((field) => {
                                                                    const checked = formData.catalogFieldPermissions[group.scope]?.includes(field.id) || false;
                                                                    return (
                                                                        <label key={field.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${checked ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={checked}
                                                                                onChange={() => toggleCatalogFieldPermission(group.scope, field.id)}
                                                                                className="h-4 w-4 accent-orange-500"
                                                                            />
                                                                            {field.label}
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-3 py-1.5 text-xs text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="px-3 py-1.5 text-xs text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {processing && <Loader2 size={16} className="animate-spin" />}
                                    Lưu thay đổi
                                </button>
                            </div>
                        </form>
            </Modal>
        </div>
    );
}
