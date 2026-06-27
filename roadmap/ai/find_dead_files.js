const fs = require('fs');
const path = require('path');

const fileMapPath = 'm:/QLCH_VanLanh/AI_FILE_MAP.md';
if (!fs.existsSync(fileMapPath)) {
  console.error('AI_FILE_MAP.md not found at ' + fileMapPath);
  process.exit(1);
}

const content = fs.readFileSync(fileMapPath, 'utf-8');
const lines = content.split('\n');

const files = [];
let currentFile = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('### `')) {
    if (currentFile) {
      files.push(currentFile);
    }
    // Extract file path: ### `path/to/file` (category)
    const match = line.match(/^### `([^`]+)`\s*\(([^)]+)\)/);
    if (match) {
      currentFile = {
        path: match[1],
        category: match[2],
        exports: null,
        importedBy: null,
        imports: null
      };
    } else {
      currentFile = {
        path: line,
        category: 'unknown',
        exports: null,
        importedBy: null,
        imports: null
      };
    }
  } else if (currentFile) {
    if (line.startsWith('- **Exports**:')) {
      currentFile.exports = line;
    } else if (line.startsWith('- **Imported by**:')) {
      currentFile.importedBy = line;
    } else if (line.startsWith('- **Imports**:')) {
      currentFile.imports = line;
    }
  }
}
if (currentFile) {
  files.push(currentFile);
}

console.log(`Total files in map: ${files.length}`);

// Define what files are allowed to have 0 importers (entry points, configs, scripts)
const isEntryPointOrConfig = (filePath) => {
  const bn = path.basename(filePath);
  const isPageOrRoute = ['page.tsx', 'layout.tsx', 'route.ts', 'loading.tsx', 'error.tsx', 'not-found.tsx', 'default.tsx', 'middleware.ts', 'sitemap.ts', 'robots.ts', 'sitemap.tsx', 'robots.tsx'].includes(bn);
  const isScript = filePath.startsWith('scripts/');
  const isConfig = bn.endsWith('.config.js') || bn.endsWith('.config.mjs') || bn.endsWith('.config.ts') || bn === 'next.config.mjs' || bn === 'tailwind.config.ts';
  return isPageOrRoute || isScript || isConfig;
};

const deadFiles = files.filter(f => !f.importedBy && !isEntryPointOrConfig(f.path));

console.log('\n=== POTENTIAL UNUSED / DEAD FILES ===');
console.log(`Found ${deadFiles.length} potential unused files:\n`);
deadFiles.forEach(f => {
  console.log(`- [${f.category}] ${f.path}`);
});
