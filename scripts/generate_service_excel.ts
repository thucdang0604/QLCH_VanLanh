import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { getAdminDb } from '../src/lib/firebaseAdmin';

interface TaxonomyNode {
    id: string;
    name: string;
    slug?: string;
    seoKeywords?: string;
    seoDescription?: string;
    warrantyType?: string;
    children?: TaxonomyNode[];
}

interface ServiceExcelRow {
    'Tên DV': string;
    'Dòng máy': string;
    'Danh mục': string;
    'Giá gốc': number;
    'Giá KM': number | string;
    'Bảo hành': string;
    'Thời gian sửa': string;
    'Mô tả': string;
    'SEO Description': string;
    'Tags': string;
    'Video': string;
    'Ảnh chính': string;
    'Ảnh phụ': string;
}

function traverseLeafNodes(nodes: TaxonomyNode[], parentPath = ''): { id: string; name: string; fullPath: string }[] {
    let result: { id: string; name: string; fullPath: string }[] = [];
    for (const node of nodes) {
        const fullPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
        if (!node.children || node.children.length === 0) {
            result.push({ id: node.id, name: node.name, fullPath });
        } else {
            result = result.concat(traverseLeafNodes(node.children, fullPath));
        }
    }
    return result;
}

const SAMPLE_IMAGE_URLS: Record<string, string> = {
    screen: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-man-hinh.webp?alt=media',
    battery: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-pin.webp?alt=media',
    glass: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fep-kinh.webp?alt=media',
    camera: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-camera.webp?alt=media',
    charging: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-cong-sac.webp?alt=media',
    faceid: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fsua-face-id.webp?alt=media',
    back: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-nap-lung.webp?alt=media',
    mainboard: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fsua-mainboard.webp?alt=media',
    keyboard: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fthay-ban-phim.webp?alt=media',
    clean: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia/o/media%2Fservices%2Fve-sinh.webp?alt=media',
};

async function generateServicesData() {
    const db = getAdminDb();
    const snap = await db.collection('system_config').doc('taxonomy_settings').get();
    const serviceTree: TaxonomyNode[] = snap.data()?.taxonomy?.service || [];
    const leafNodes = traverseLeafNodes(serviceTree);

    console.log(`Found ${leafNodes.length} leaf service taxonomy nodes.`);

    const rows: ServiceExcelRow[] = [];

    // Detailed device models per category
    const iphoneModels = [
        'iPhone 8', 'iPhone 8 Plus', 'iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max',
        'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
        'iPhone 12 mini', 'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
        'iPhone 13 mini', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
        'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
        'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
        'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
    ];

    const androidModels = [
        'Samsung Galaxy S20', 'Samsung Galaxy S20 FE', 'Samsung Galaxy S20 Ultra',
        'Samsung Galaxy S21', 'Samsung Galaxy S21 Ultra',
        'Samsung Galaxy S22', 'Samsung Galaxy S22 Ultra',
        'Samsung Galaxy S23', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy S24', 'Samsung Galaxy S24 Ultra',
        'Samsung Galaxy Z Fold 4', 'Samsung Galaxy Z Fold 5', 'Samsung Galaxy Z Flip 4', 'Samsung Galaxy Z Flip 5',
        'Xiaomi Redmi Note 10', 'Xiaomi Redmi Note 11', 'Xiaomi Redmi Note 12 Pro', 'Xiaomi 13T Pro', 'Xiaomi 14',
        'OPPO Reno 8', 'OPPO Reno 10', 'OPPO Reno 11 Pro', 'OPPO Find X5 Pro',
        'Realme Q5', 'Realme GT Neo 3', 'Vivo V27e', 'Vivo X90 Pro',
    ];

    const ipadModels = [
        'iPad Gen 7 10.2"', 'iPad Gen 8 10.2"', 'iPad Gen 9 10.2"', 'iPad Gen 10 10.9"',
        'iPad Air 3', 'iPad Air 4', 'iPad Air 5 M1', 'iPad Air 11" M2',
        'iPad Pro 11" 2018', 'iPad Pro 11" 2020', 'iPad Pro 11" M1', 'iPad Pro 11" M2', 'iPad Pro 11" M4',
        'iPad Pro 12.9" M1', 'iPad Pro 12.9" M2', 'iPad Pro 13" M4',
        'iPad Mini 5', 'iPad Mini 6',
    ];

    const tabletAndroidModels = [
        'Samsung Galaxy Tab S6 Lite', 'Samsung Galaxy Tab S7', 'Samsung Galaxy Tab S8', 'Samsung Galaxy Tab S9 FE', 'Samsung Galaxy Tab S9 Ultra',
        'Xiaomi Pad 5', 'Xiaomi Pad 6', 'Lenovo Tab P11 Pro',
    ];

    const appleWatchModels = [
        'Apple Watch Series 3 38mm', 'Apple Watch Series 3 42mm',
        'Apple Watch Series 4 40mm', 'Apple Watch Series 4 44mm',
        'Apple Watch Series 5 40mm', 'Apple Watch Series 5 44mm',
        'Apple Watch Series 6 40mm', 'Apple Watch Series 6 44mm',
        'Apple Watch Series 7 41mm', 'Apple Watch Series 7 45mm',
        'Apple Watch Series 8 41mm', 'Apple Watch Series 8 45mm',
        'Apple Watch Series 9 41mm', 'Apple Watch Series 9 45mm',
        'Apple Watch SE 40mm', 'Apple Watch SE 44mm',
        'Apple Watch Ultra 49mm', 'Apple Watch Ultra 2 49mm',
    ];

    const smartWatchModels = [
        'Samsung Galaxy Watch 4 40mm', 'Samsung Galaxy Watch 4 Classic',
        'Samsung Galaxy Watch 5 44mm', 'Samsung Galaxy Watch 5 Pro',
        'Samsung Galaxy Watch 6 44mm', 'Samsung Galaxy Watch 6 Classic',
        'Huawei Watch GT 3', 'Huawei Watch GT 4',
    ];

    const macbookModels = [
        'MacBook Air 13" 2017 A1466', 'MacBook Air 13" 2018-2019 A1932', 'MacBook Air 13" M1 2020 A2337',
        'MacBook Air 13.6" M2 2022 A2681', 'MacBook Air 15" M2 2023 A2941', 'MacBook Air 13" M3 2024',
        'MacBook Pro 13" 2017-2019 A1708/A2159', 'MacBook Pro 13" M1 2020 A2338', 'MacBook Pro 14" M1 Pro 2021 A2442',
        'MacBook Pro 16" M1 Max 2021 A2485', 'MacBook Pro 14" M2 Pro 2023 A2779', 'MacBook Pro 14" M3 2023',
    ];

    const windowsLaptopModels = [
        'Dell XPS 13 9300', 'Dell Inspiron 15 3511', 'Dell Latitude 7490', 'Dell Vostro 5410',
        'HP Pavilion 15', 'HP Envy x360 13', 'HP ProBook 450 G8',
        'Lenovo ThinkPad X1 Carbon Gen 9', 'Lenovo IdeaPad Slim 3', 'Lenovo Legion 5 Pro',
        'ASUS ZenBook 14', 'ASUS TUF Gaming F15', 'ASUS Vivobook 15',
        'Acer Nitro 5 Gaming', 'Acer Swift 3', 'MSI Modern 14',
    ];

    // Helper generator for prices
    const getRandomPrice = (base: number, step: number) => {
        return base + Math.floor(Math.random() * 10) * step;
    };

    // Populate rows loop to hit ~500 items
    for (const node of leafNodes) {
        let models: string[] = [];
        let defaultImg = SAMPLE_IMAGE_URLS.clean;
        let defaultTime = '30 - 45 phút';
        let defaultWarranty = '6 tháng';

        if (node.id.includes('apple') || node.id.includes('iphone')) {
            models = iphoneModels;
        } else if (node.id.includes('android')) {
            models = androidModels;
        } else if (node.id.includes('ipad')) {
            models = ipadModels;
        } else if (node.id.includes('tablet')) {
            models = tabletAndroidModels;
        } else if (node.id.includes('apple-watch') || node.id.includes('aw')) {
            models = appleWatchModels;
        } else if (node.id.includes('smart-watch') || node.id.includes('sw')) {
            models = smartWatchModels;
        } else if (node.id.includes('macbook')) {
            models = macbookModels;
        } else if (node.id.includes('laptop')) {
            models = windowsLaptopModels;
        } else {
            models = [...iphoneModels.slice(10, 20), ...androidModels.slice(0, 10)];
        }

        // Image resolution
        if (node.id.includes('man-hinh')) defaultImg = SAMPLE_IMAGE_URLS.screen;
        else if (node.id.includes('pin')) defaultImg = SAMPLE_IMAGE_URLS.battery;
        else if (node.id.includes('kinh')) defaultImg = SAMPLE_IMAGE_URLS.glass;
        else if (node.id.includes('camera')) defaultImg = SAMPLE_IMAGE_URLS.camera;
        else if (node.id.includes('sac')) defaultImg = SAMPLE_IMAGE_URLS.charging;
        else if (node.id.includes('face-id')) defaultImg = SAMPLE_IMAGE_URLS.faceid;
        else if (node.id.includes('lung') || node.id.includes('vo')) defaultImg = SAMPLE_IMAGE_URLS.back;
        else if (node.id.includes('mainboard')) defaultImg = SAMPLE_IMAGE_URLS.mainboard;
        else if (node.id.includes('ban-phim')) defaultImg = SAMPLE_IMAGE_URLS.keyboard;

        // Warranty & Repair time resolution
        if (node.id.includes('ve-sinh')) {
            defaultWarranty = 'Không bảo hành';
            defaultTime = '20 - 30 phút';
        } else if (node.id.includes('mainboard') || node.id.includes('ssd') || node.id.includes('ram')) {
            defaultWarranty = '12 tháng';
            defaultTime = '1 - 2 giờ';
        } else if (node.id.includes('man-hinh') || node.id.includes('pin')) {
            defaultWarranty = '6 - 12 tháng';
            defaultTime = '30 - 60 phút';
        }

        // Generate 6 to 9 specific services per leaf node to reach ~500 items
        const countForThisNode = Math.min(models.length, Math.floor(450 / leafNodes.length) + (rows.length % 3 === 0 ? 3 : 2));

        for (let i = 0; i < countForThisNode; i++) {
            const model = models[i % models.length];
            const serviceName = `${node.name} ${model}`;

            // Price calculation
            let basePrice = 250000;
            if (model.includes('Pro Max') || model.includes('Ultra') || model.includes('MacBook Pro') || model.includes('Z Fold')) {
                basePrice = 1800000;
            } else if (model.includes('Pro') || model.includes('Air') || model.includes('XPS')) {
                basePrice = 950000;
            } else if (model.includes('14') || model.includes('13') || model.includes('12')) {
                basePrice = 650000;
            }

            if (node.id.includes('man-hinh')) basePrice *= 2.2;
            if (node.id.includes('mainboard')) basePrice *= 1.8;
            if (node.id.includes('ve-sinh')) basePrice = 150000;

            const originalPrice = Math.round(getRandomPrice(basePrice, 50000) / 10000) * 10000;
            const hasPromo = i % 2 === 0 && !node.id.includes('ve-sinh');
            const promoPrice = hasPromo ? Math.round((originalPrice * 0.88) / 10000) * 10000 : '';

            const description = `Dịch vụ ${serviceName} uy tín, chất lượng cao tại Hệ thống Sửa chữa Văn Lành. Linh kiện chuẩn chất lượng, kỹ thuật viên nhiều năm kinh nghiệm thực hiện trực tiếp trước mặt khách hàng. Vệ sinh máy miễn phí.`;
            const seoDescription = `${serviceName} giá rẻ, lấy liền tại TP.HCM. Bảo hành ${defaultWarranty}. Kỹ thuật tay nghề cao, linh kiện chuẩn.`;
            const tags = `${node.name}, ${model}, Sửa chữa Văn Lành, ${hasPromo ? 'Khuyến mãi, HOT' : 'Uy tín'}`;
            const videoUrl = 'https://www.youtube.com/watch?v=demo_repair_video';

            rows.push({
                'Tên DV': serviceName,
                'Dòng máy': model,
                'Danh mục': node.fullPath,
                'Giá gốc': originalPrice,
                'Giá KM': promoPrice,
                'Bảo hành': defaultWarranty,
                'Thời gian sửa': defaultTime,
                'Mô tả': description,
                'SEO Description': seoDescription,
                'Tags': tags,
                'Video': videoUrl,
                'Ảnh chính': defaultImg,
                'Ảnh phụ': `${defaultImg}, ${SAMPLE_IMAGE_URLS.clean}`,
            });
        }
    }

    console.log(`Generated ${rows.length} total services.`);
    return rows;
}

async function main() {
    const rows = await generateServicesData();

    // Create Excel Workbook using SheetJS (xlsx)
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths for readability
    worksheet['!cols'] = [
        { wch: 45 }, // Tên DV
        { wch: 25 }, // Dòng máy
        { wch: 45 }, // Danh mục
        { wch: 15 }, // Giá gốc
        { wch: 15 }, // Giá KM
        { wch: 15 }, // Bảo hành
        { wch: 18 }, // Thời gian sửa
        { wch: 60 }, // Mô tả
        { wch: 50 }, // SEO Description
        { wch: 35 }, // Tags
        { wch: 35 }, // Video
        { wch: 55 }, // Ảnh chính
        { wch: 65 }, // Ảnh phụ
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dich_vu');

    const fileName = 'Import_500_DichVu_SuaChua_VanLanh.xlsx';
    const filePath = path.resolve(process.cwd(), fileName);
    XLSX.writeFile(workbook, filePath);

    console.log(`Successfully created Excel file at: ${filePath}`);

    // Also copy to brain artifacts directory
    const artifactPath = `C:\\Users\\thucd\\.gemini\\antigravity-ide\\brain\\cf3b8c4b-de21-40a0-9eaf-59cd9f79f837\\${fileName}`;
    fs.copyFileSync(filePath, artifactPath);
    console.log(`Copied Excel file to artifacts at: ${artifactPath}`);
}

main().then(() => process.exit(0)).catch(err => {
    console.error('Error generating Excel file:', err);
    process.exit(1);
});
