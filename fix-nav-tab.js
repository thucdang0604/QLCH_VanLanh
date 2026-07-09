const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/admin/settings/NavigationTab.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix row flex containers to use flex-wrap
content = content.replace(
    /className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50\/50 group"/g,
    'className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-3 hover:bg-gray-50/50 group border-b border-gray-50 last:border-0"'
);

content = content.replace(
    /className="px-5 py-3 flex items-center gap-3 group"/g,
    'className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-3 group border-b border-gray-50 last:border-0"'
);

// 2. Fix the flex-1 inputs to ensure they force wrap on small screens by adding min-w
content = content.replace(
    /className="flex-1 text-sm border/g,
    'className="flex-1 min-w-[150px] text-sm border'
);

// 3. Fix the Trash button visibility on mobile
content = content.replace(
    /opacity-0 group-hover:opacity-100 transition-opacity/g,
    'opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity'
);

// 4. Fix up/down buttons arrangement to be horizontal on mobile, vertical on desktop
content = content.replace(
    /<div className="flex flex-col">/g,
    '<div className="flex flex-row md:flex-col gap-1 md:gap-0">'
);

// 5. Expand sub-group inputs to be full width on mobile
content = content.replace(
    /className="flex-1 text-sm font-medium border rounded/g,
    'className="flex-1 min-w-[200px] text-sm font-medium border rounded'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('NavigationTab.tsx updated successfully');
