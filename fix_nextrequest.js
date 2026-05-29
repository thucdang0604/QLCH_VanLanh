const fs = require('fs');
const files = [
  'src/app/api/inventory/import/route.ts',
  'src/app/api/orders/assign-seller/route.ts',
  'src/app/api/orders/transition/route.ts',
  'src/app/api/pos/checkout/route.ts',
  'src/app/api/repairs/confirm-parts/route.ts',
  'src/app/api/repairs/handover/route.ts',
  'src/app/api/repairs/payment-edit/route.ts',
  'src/app/api/repairs/transition/route.ts'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('NextRequest')) {
    content = content.replace(/import \{ NextResponse \} from 'next\/server';/, "import { NextResponse, NextRequest } from 'next/server';");
  }

  content = content.replace(/export async function (POST|GET)\((req|request): Request\)/g, "export async function $1($2: NextRequest)");
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed NextRequest in ' + file);
}
