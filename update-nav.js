const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/admin/settings/NavigationTab.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const target = `            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Menu</h1>
                    <p className="text-gray-500 mt-1">Tùy chỉnh Header, Sidebar và Footer navigation</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu tất cả
                </button>
            </div>`;

const targetRegex = /\{\/\* Header \*\/\}\s*<div className="flex items-center justify-between">\s*<div>\s*<h1 className="text-2xl font-bold text-gray-900">Quản lý Menu<\/h1>\s*<p className="text-gray-500 mt-1">Tùy chỉnh Header, Sidebar và Footer navigation<\/p>\s*<\/div>\s*<button\s*onClick=\{handleSave\}\s*disabled=\{saving\}\s*className="flex items-center gap-2 px-5 py-2\.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"\s*>\s*\{saving \? <Loader2 size=\{16\} className="animate-spin" \/> : <Save size=\{16\} \/>\}\s*Lưu tất cả\s*<\/button>\s*<\/div>/g;

const replacement = `{/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Menu</h1>
                    <p className="text-gray-500 mt-1">Tùy chỉnh Header, Sidebar và Footer navigation</p>
                </div>
            </div>

            {/* Mobile Sticky Save Button */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 md:static md:p-0 md:bg-transparent md:border-t-0 md:z-auto md:flex md:justify-end md:-mt-16">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu tất cả
                </button>
            </div>`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully updated NavigationTab.tsx');
} else {
    console.log('Could not find target string in NavigationTab.tsx');
}
