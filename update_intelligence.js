const fs = require('fs');
const path = require('path');

const srcDir = 'm:/QLCH_VanLanh/src';
const typesDir = path.join(srcDir, 'lib', 'types');
const apiDir = path.join(srcDir, 'app', 'api');
const jsonPath = 'm:/QLCH_VanLanh/roadmap/ui/data/source_intelligence.json';

let intelligence = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// 1. Extract Types
const dbSchema = intelligence.databaseSchema || {};
if (!fs.existsSync(typesDir)) {
  console.log("types directory not found");
} else {
  const typeFiles = fs.readdirSync(typesDir).filter(f => f.endsWith('.ts'));

  for (const file of typeFiles) {
    const content = fs.readFileSync(path.join(typesDir, file), 'utf-8');

    // Extract interfaces
    const interfaceRegex = /export\s+interface\s+([A-Za-z0-9_]+)\s*(?:extends\s+[^{]+)?\s*{([^}]*)}/gs;
    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];

      const fields = {};
      const fieldRegex = /^\s*([A-Za-z0-9_?]+)\s*:\s*([^;]+);?/gm;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }

      if (Object.keys(fields).length > 0) {
        if (!dbSchema[name]) dbSchema[name] = { fields: {}, description: `Auto-mapped from types/${file}` };
        dbSchema[name].fields = { ...dbSchema[name].fields, ...fields };
      }
    }

    // Extract types
    const typeRegex = /export\s+type\s+([A-Za-z0-9_]+)\s*=\s*{([^}]*)}/gs;
    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];

      const fields = {};
      const fieldRegex = /^\s*([A-Za-z0-9_?]+)\s*:\s*([^;]+);?/gm;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }

      if (Object.keys(fields).length > 0) {
        if (!dbSchema[name]) dbSchema[name] = { fields: {}, description: `Auto-mapped from types/${file}` };
        dbSchema[name].fields = { ...dbSchema[name].fields, ...fields };
      }
    }
  }
}

intelligence.databaseSchema = dbSchema;

// 2. Extract API Endpoints
const apiEndpoints = intelligence.apiEndpoints || {};

function scanApiDir(dir, routePrefix = '') {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      scanApiDir(path.join(dir, entry.name), `${routePrefix}/${entry.name}`);
    } else if (entry.name === 'route.ts') {
      const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      const methods = [];
      const methodsRegex = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g;
      let match;
      while ((match = methodsRegex.exec(content)) !== null) {
        methods.push(match[1]);
      }

      if (methods.length > 0) {
        const endpoint = `/api${routePrefix}`;
        if (!apiEndpoints[endpoint]) {
          apiEndpoints[endpoint] = {
            methods,
            description: `Auto-mapped from app/api${routePrefix}/route.ts`,
            file: `src/app/api${routePrefix}/route.ts`
          };
        } else {
          apiEndpoints[endpoint].methods = Array.from(new Set([...apiEndpoints[endpoint].methods, ...methods]));
        }
      }
    }
  }
}

scanApiDir(apiDir);
intelligence.apiEndpoints = apiEndpoints;

intelligence._meta.lastUpdated = new Date().toISOString();
intelligence._meta.version = (intelligence._meta.version || 0) + 1;
intelligence._meta.changelog.push(`v${intelligence._meta.version}: Read source code one by one and merged accurate Database Schema & API Endpoints.`);

fs.writeFileSync(jsonPath, JSON.stringify(intelligence, null, 2));
console.log("Success");
