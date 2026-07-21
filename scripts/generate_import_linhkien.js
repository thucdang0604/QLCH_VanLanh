/* eslint-disable no-console */
const XLSX = require('xlsx');

// ============ CẤU HÌNH ============
const NCC = 'Văn Lành';
const TON_KHO = 0;
const GIA_VON = 1000; // Đặt giá vốn tối thiểu 1000đ để tránh lỗi hệ thống
const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];

// Hàm tính thời gian bảo hành động theo loại linh kiện
function getWarrantyMonths(subcat) {
  const name = subcat.toLowerCase();
  if (name.includes('pin')) return 12; // Pin: 12 tháng
  if (name.includes('ram') || name.includes('ssd')) return 36; // RAM/SSD: 36 tháng
  if (name.includes('bàn phím') || name.includes('sạc') || name.includes('adapter')) return 12; // Bàn phím, Sạc: 12 tháng
  if (name.includes('màn hình')) return 6; // Màn hình: 6 tháng
  if (name.includes('mainboard') || name.includes('ic')) return 3; // Mainboard, IC: 3 tháng
  if (name.includes('vỏ') || name.includes('bản lề') || name.includes('lưng') || name.includes('sườn')) return 3; // Vỏ, bản lề: 3 tháng
  return 6; // Camera, Loa, Mic, Cáp sạc... mặc định 6 tháng
}

// Hàm tính giá bán động ước lượng theo dòng máy và loại linh kiện
function estimatePrice(subcat, device, quality) {
  const devLower = device.toLowerCase();
  const subLower = subcat.toLowerCase();

  // Xác định phân khúc dòng máy
  let tier = 'budget_phone';
  if (devLower.includes('16 pro') || devLower.includes('16 plus') || devLower.includes('16 pro max') || devLower.includes('15 pro') || devLower.includes('s25') || devLower.includes('s24') || devLower.includes('fold') || devLower.includes('flip')) {
    tier = 'flagship_phone';
  } else if (devLower.includes('iphone 14') || devLower.includes('iphone 13') || devLower.includes('iphone 12') || devLower.includes('s23') || devLower.includes('s22') || devLower.includes('xiaomi 14') || devLower.includes('reno 12')) {
    tier = 'normal_phone';
  } else if (devLower.includes('macbook')) {
    tier = 'macbook';
  } else if (devLower.includes('dell') || devLower.includes('hp') || devLower.includes('lenovo') || devLower.includes('asus') || devLower.includes('acer') || devLower.includes('msi')) {
    tier = 'laptop_windows';
  } else if (devLower.includes('ipad pro') || devLower.includes('ipad air')) {
    tier = 'ipad_pro_air';
  } else if (devLower.includes('ipad')) {
    tier = 'ipad_gen_mini';
  } else if (devLower.includes('tab') || devLower.includes('pad')) {
    tier = 'tablet_android';
  }

  // Giá bán cơ bản cho chất lượng Zin
  let basePrice = 400000; // Giá mặc định cho linh kiện nhỏ

  if (subLower.includes('màn hình')) {
    if (tier === 'flagship_phone') basePrice = 6500000;
    else if (tier === 'normal_phone') basePrice = 3200000;
    else if (tier === 'budget_phone') basePrice = 1400000;
    else if (tier === 'macbook') basePrice = 7500000;
    else if (tier === 'laptop_windows') basePrice = 2200000;
    else if (tier === 'ipad_pro_air') basePrice = 4500000;
    else if (tier === 'ipad_gen_mini') basePrice = 2800000;
    else if (tier === 'tablet_android') basePrice = 1900000;
  } else if (subLower.includes('pin')) {
    if (tier === 'flagship_phone') basePrice = 1100000;
    else if (tier === 'normal_phone') basePrice = 750000;
    else if (tier === 'budget_phone') basePrice = 450000;
    else if (tier === 'macbook') basePrice = 1800000;
    else if (tier === 'laptop_windows') basePrice = 950000;
    else basePrice = 850000; // Tablet/iPad
  } else if (subLower.includes('mainboard') || subLower.includes('ic')) {
    if (tier === 'flagship_phone') basePrice = 4500000;
    else if (tier === 'normal_phone') basePrice = 2500000;
    else if (tier === 'budget_phone') basePrice = 1200000;
    else basePrice = 3500000; // Laptop/Tablet
  } else if (subLower.includes('ram') || subLower.includes('ssd')) {
    basePrice = 1200000;
  } else if (subLower.includes('bàn phím')) {
    if (tier === 'macbook') basePrice = 1400000;
    else basePrice = 600000;
  } else if (subLower.includes('sạc') || subLower.includes('adapter')) {
    if (tier === 'macbook') basePrice = 1600000;
    else basePrice = 650000;
  } else if (subLower.includes('camera')) {
    if (tier === 'flagship_phone') basePrice = 1500000;
    else if (tier === 'normal_phone') basePrice = 850000;
    else basePrice = 450000;
  } else if (subLower.includes('vỏ') || subLower.includes('lưng') || subLower.includes('sườn') || subLower.includes('bản lề')) {
    if (tier === 'flagship_phone') basePrice = 1800000;
    else if (tier === 'normal_phone') basePrice = 900000;
    else if (tier === 'macbook') basePrice = 2500000;
    else if (tier === 'laptop_windows') basePrice = 1100000;
    else basePrice = 500000;
  }

  // Điều chỉnh giá theo chất lượng
  let multiplier = 1.0;
  if (quality === 'Loại 1') multiplier = 0.8;
  else if (quality === 'Loại 2') multiplier = 0.65;
  else if (quality === 'Bóc máy') multiplier = 0.95;

  return Math.round((basePrice * multiplier) / 1000) * 1000; // Làm tròn đến hàng nghìn đồng
}

// ============ DANH MỤC LINH KIỆN (từ taxonomy component đã tạo) ============

const categories = {
  'Linh kiện Điện thoại': {
    subcategories: [
      'Màn hình', 'Pin', 'Vỏ - Lưng - Sườn', 'Camera', 'Loa & Mic',
      'Cổng sạc & Cáp nguồn', 'Cảm biến & Phím', 'IC & Mainboard',
      'Mặt kính', 'Cáp Face ID & Cảm biến', 'Anten & Sóng', 'Rung & Motor'
    ],
    devices: {
      'Màn hình': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
        'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
        'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 Mini',
        'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini',
        'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
        'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
        'iPhone SE 2022', 'iPhone SE 2020',
        'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S25+', 'Samsung Galaxy S25',
        'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24+', 'Samsung Galaxy S24',
        'Samsung Galaxy S23 Ultra', 'Samsung Galaxy S23+', 'Samsung Galaxy S23',
        'Samsung Galaxy S22 Ultra', 'Samsung Galaxy S22+', 'Samsung Galaxy S22',
        'Samsung Galaxy S21 Ultra', 'Samsung Galaxy S21+', 'Samsung Galaxy S21',
        'Samsung Galaxy Z Fold 6', 'Samsung Galaxy Z Fold 5', 'Samsung Galaxy Z Fold 4',
        'Samsung Galaxy Z Flip 6', 'Samsung Galaxy Z Flip 5', 'Samsung Galaxy Z Flip 4',
        'Samsung Galaxy A55', 'Samsung Galaxy A54', 'Samsung Galaxy A35', 'Samsung Galaxy A34',
        'Samsung Galaxy A25', 'Samsung Galaxy A15', 'Samsung Galaxy A05s',
        'Xiaomi 14 Ultra', 'Xiaomi 14 Pro', 'Xiaomi 14',
        'Xiaomi 13 Ultra', 'Xiaomi 13 Pro', 'Xiaomi 13',
        'Xiaomi Redmi Note 13 Pro+', 'Xiaomi Redmi Note 13 Pro', 'Xiaomi Redmi Note 13',
        'Xiaomi Redmi Note 12 Pro+', 'Xiaomi Redmi Note 12 Pro', 'Xiaomi Redmi Note 12',
        'OPPO Find X7 Ultra', 'OPPO Find X6 Pro',
        'OPPO Reno 12 Pro', 'OPPO Reno 12', 'OPPO Reno 11 Pro', 'OPPO Reno 11',
        'OPPO A98', 'OPPO A78', 'OPPO A58', 'OPPO A38',
        'Vivo X100 Pro', 'Vivo X100',
        'Vivo V30 Pro', 'Vivo V30', 'Vivo V29', 'Vivo V27',
        'Vivo Y36', 'Vivo Y27',
      ],
      'Pin': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
        'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
        'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 Mini',
        'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini',
        'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
        'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
        'iPhone SE 2022', 'iPhone SE 2020',
        'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S25+', 'Samsung Galaxy S25',
        'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24+', 'Samsung Galaxy S24',
        'Samsung Galaxy S23 Ultra', 'Samsung Galaxy S23+', 'Samsung Galaxy S23',
        'Samsung Galaxy S22 Ultra', 'Samsung Galaxy S22+', 'Samsung Galaxy S22',
        'Samsung Galaxy A55', 'Samsung Galaxy A54', 'Samsung Galaxy A35', 'Samsung Galaxy A34',
        'Samsung Galaxy A25', 'Samsung Galaxy A15',
        'Xiaomi 14 Ultra', 'Xiaomi 14 Pro', 'Xiaomi 14',
        'Xiaomi Redmi Note 13 Pro+', 'Xiaomi Redmi Note 13 Pro', 'Xiaomi Redmi Note 13',
        'Xiaomi Redmi Note 12 Pro+', 'Xiaomi Redmi Note 12 Pro', 'Xiaomi Redmi Note 12',
        'OPPO Reno 12 Pro', 'OPPO Reno 12', 'OPPO Reno 11 Pro', 'OPPO Reno 11',
        'OPPO A78', 'OPPO A58',
      ],
      'Camera': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 11 Pro Max', 'iPhone 11 Pro',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy S22 Ultra', 'Samsung Galaxy A55', 'Samsung Galaxy A54',
        'Xiaomi 14 Ultra', 'Xiaomi 14 Pro',
        'OPPO Find X7 Ultra', 'OPPO Reno 12 Pro',
      ],
      'Loa & Mic': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 11 Pro Max', 'iPhone 11',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy A55', 'Samsung Galaxy A54',
      ],
      'Cổng sạc & Cáp nguồn': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12', 'iPhone 11 Pro Max', 'iPhone 11',
        'iPhone XS Max', 'iPhone X',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy A55', 'Samsung Galaxy A54', 'Samsung Galaxy A35',
        'Xiaomi Redmi Note 13 Pro+', 'Xiaomi Redmi Note 13 Pro',
        'OPPO Reno 12 Pro', 'OPPO A78',
      ],
      'Vỏ - Lưng - Sườn': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12', 'iPhone 11 Pro Max', 'iPhone 11',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy A55', 'Samsung Galaxy A54',
      ],
      'Cảm biến & Phím': [
        'iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max', 'iPhone 13 Pro Max',
        'iPhone 12 Pro Max', 'iPhone 11 Pro Max',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
      ],
      'Mặt kính': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12', 'iPhone 11 Pro Max', 'iPhone 11',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
        'Samsung Galaxy S22 Ultra', 'Samsung Galaxy A55', 'Samsung Galaxy A54',
      ],
      'IC & Mainboard': [
        'iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max',
        'iPhone 13 Pro Max', 'iPhone 12 Pro Max', 'iPhone 11 Pro Max',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S23 Ultra',
      ],
      'Cáp Face ID & Cảm biến': [
        'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 15 Pro Max', 'iPhone 15 Pro',
        'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Pro',
        'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 11 Pro Max', 'iPhone 11 Pro',
        'iPhone XS Max', 'iPhone XS', 'iPhone X',
      ],
      'Anten & Sóng': [
        'iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max',
        'iPhone 13 Pro Max', 'iPhone 12 Pro Max',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra',
      ],
      'Rung & Motor': [
        'iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max',
        'iPhone 13 Pro Max', 'iPhone 12 Pro Max', 'iPhone 11 Pro Max',
        'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S24 Ultra',
      ],
    }
  },
  'Linh kiện Laptop': {
    subcategories: [
      'Bàn phím', 'Pin Laptop', 'RAM & SSD', 'Màn hình Laptop',
      'Sạc & Adapter Laptop', 'Quạt tản nhiệt', 'Bản lề', 'Loa Laptop',
      'Touchpad', 'Webcam & Mic', 'Cáp màn hình', 'Vỏ Laptop',
      'Cổng kết nối & Jack', 'Mainboard Laptop'
    ],
    devices: {
      'Bàn phím': [
        'MacBook Air M2 13"', 'MacBook Air M2 15"', 'MacBook Air M1',
        'MacBook Pro 14" M3 Pro', 'MacBook Pro 16" M3 Max',
        'Dell Inspiron 15 3520', 'Dell Inspiron 14 5420', 'Dell Latitude 5540', 'Dell XPS 13 9340', 'Dell XPS 15 9530',
        'HP Pavilion 15', 'HP EliteBook 840 G10', 'HP Envy x360 15',
        'Lenovo ThinkPad E14 Gen5', 'Lenovo IdeaPad Slim 5', 'Lenovo ThinkPad X1 Carbon Gen11',
        'ASUS VivoBook 15 X1504', 'ASUS ZenBook 14 UX3402', 'ASUS ROG Strix G16',
        'Acer Aspire 5 A515', 'Acer Swift 3 SF314', 'Acer Nitro 5 AN515',
      ],
      'Pin Laptop': [
        'MacBook Air M2 13"', 'MacBook Air M2 15"', 'MacBook Air M1',
        'MacBook Pro 14" M3 Pro', 'MacBook Pro 16" M3 Max',
        'Dell Inspiron 15 3520', 'Dell Latitude 5540', 'Dell XPS 13 9340',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5', 'Lenovo IdeaPad Slim 5',
        'ASUS VivoBook 15 X1504', 'ASUS ZenBook 14 UX3402',
        'Acer Aspire 5 A515', 'Acer Swift 3 SF314',
      ],
      'RAM & SSD': [
        'RAM DDR4 8GB 3200MHz', 'RAM DDR4 16GB 3200MHz',
        'RAM DDR5 8GB 4800MHz', 'RAM DDR5 16GB 5600MHz',
        'SSD NVMe M.2 256GB', 'SSD NVMe M.2 512GB', 'SSD NVMe M.2 1TB',
        'SSD SATA 2.5" 256GB', 'SSD SATA 2.5" 512GB', 'SSD SATA 2.5" 1TB',
      ],
      'Màn hình Laptop': [
        'Màn hình 13.3" FHD IPS', 'Màn hình 14" FHD IPS', 'Màn hình 14" 2.8K OLED',
        'Màn hình 15.6" FHD IPS', 'Màn hình 15.6" FHD TN',
        'Màn hình 16" WQXGA IPS', 'Màn hình 16" 2.5K IPS 165Hz',
        'Màn hình 17.3" FHD IPS',
      ],
      'Sạc & Adapter Laptop': [
        'Sạc MacBook USB-C 30W', 'Sạc MacBook USB-C 67W', 'Sạc MacBook USB-C 96W', 'Sạc MacBook MagSafe 140W',
        'Sạc Dell 65W Type-C', 'Sạc Dell 90W', 'Sạc Dell 130W',
        'Sạc HP 65W Type-C', 'Sạc HP 90W Smart',
        'Sạc Lenovo 65W USB-C', 'Sạc Lenovo 135W Slim Tip',
        'Sạc ASUS 65W', 'Sạc ASUS 120W', 'Sạc ASUS 180W',
        'Sạc Acer 65W', 'Sạc Acer 135W',
      ],
      'Quạt tản nhiệt': [
        'MacBook Air M1', 'MacBook Pro 14" M3',
        'Dell Inspiron 15 3520', 'Dell Latitude 5540', 'Dell XPS 15 9530',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5', 'Lenovo IdeaPad Slim 5',
        'ASUS VivoBook 15 X1504', 'ASUS ROG Strix G16',
        'Acer Aspire 5 A515', 'Acer Nitro 5 AN515',
      ],
      'Bản lề': [
        'Dell Inspiron 15 3520', 'Dell Inspiron 14 5420', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5', 'Lenovo IdeaPad Slim 5',
        'ASUS VivoBook 15 X1504', 'ASUS ZenBook 14 UX3402',
        'Acer Aspire 5 A515', 'Acer Swift 3 SF314',
      ],
      'Loa Laptop': [
        'MacBook Air M2 13"', 'MacBook Pro 14" M3',
        'Dell Inspiron 15 3520', 'Dell XPS 13 9340',
        'HP Pavilion 15', 'HP Envy x360 15',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504', 'ASUS ZenBook 14 UX3402',
      ],
      'Touchpad': [
        'Dell Inspiron 15 3520', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504',
        'Acer Aspire 5 A515',
      ],
      'Webcam & Mic': [
        'Dell Inspiron 15 3520', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504',
      ],
      'Cáp màn hình': [
        'Dell Inspiron 15 3520', 'Dell Latitude 5540', 'Dell XPS 15 9530',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5', 'Lenovo IdeaPad Slim 5',
        'ASUS VivoBook 15 X1504', 'ASUS ROG Strix G16',
        'Acer Aspire 5 A515', 'Acer Nitro 5 AN515',
      ],
      'Vỏ Laptop': [
        'Dell Inspiron 15 3520', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504',
        'Acer Aspire 5 A515',
      ],
      'Cổng kết nối & Jack': [
        'Dell Inspiron 15 3520', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504',
        'Acer Aspire 5 A515',
      ],
      'Mainboard Laptop': [
        'MacBook Air M1', 'MacBook Air M2 13"', 'MacBook Pro 14" M3',
        'Dell Inspiron 15 3520', 'Dell Latitude 5540',
        'HP Pavilion 15', 'HP EliteBook 840 G10',
        'Lenovo ThinkPad E14 Gen5',
        'ASUS VivoBook 15 X1504',
      ],
    }
  },
  'Linh kiện Máy tính bảng': {
    subcategories: [
      'Màn hình & Cảm ứng', 'Pin Tablet', 'Camera Tablet', 'Loa & Mic Tablet',
      'Cổng sạc Tablet', 'Vỏ & Nắp lưng Tablet', 'Phím Home & Touch ID',
      'Mặt kính Tablet', 'Mainboard Tablet'
    ],
    devices: {
      'Màn hình & Cảm ứng': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10', 'iPad 9', 'iPad Mini 6',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+', 'Samsung Galaxy Tab S9',
        'Samsung Galaxy Tab S8 Ultra', 'Samsung Galaxy Tab A9+', 'Samsung Galaxy Tab A9',
        'Xiaomi Pad 6 Pro', 'Xiaomi Pad 6', 'Xiaomi Redmi Pad SE',
      ],
      'Pin Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10', 'iPad 9', 'iPad Mini 6',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+', 'Samsung Galaxy Tab S9',
        'Samsung Galaxy Tab A9+', 'Samsung Galaxy Tab A9',
        'Xiaomi Pad 6', 'Xiaomi Redmi Pad SE',
      ],
      'Camera Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+',
      ],
      'Loa & Mic Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10', 'iPad 9',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+',
      ],
      'Cổng sạc Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10', 'iPad 9',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+', 'Samsung Galaxy Tab S9',
        'Xiaomi Pad 6',
      ],
      'Vỏ & Nắp lưng Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9',
      ],
      'Phím Home & Touch ID': [
        'iPad Air M1', 'iPad 10', 'iPad 9', 'iPad Mini 6',
      ],
      'Mặt kính Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10', 'iPad 9', 'iPad Mini 6',
        'Samsung Galaxy Tab S9 Ultra', 'Samsung Galaxy Tab S9+', 'Samsung Galaxy Tab S9',
        'Samsung Galaxy Tab A9+',
      ],
      'Mainboard Tablet': [
        'iPad Pro 12.9" M2', 'iPad Pro 11" M2', 'iPad Air M1', 'iPad 10',
        'Samsung Galaxy Tab S9 Ultra',
      ],
    }
  }
};

// ============ GENERATE ROWS ============
const rows = [];

for (const [mainCat, config] of Object.entries(categories)) {
  for (const subcat of config.subcategories) {
    const devices = config.devices[subcat] || [];

    for (const device of devices) {
      let categoryPath = '';
      if (mainCat === 'Linh kiện Điện thoại') {
        const isIphone = device.toLowerCase().includes('iphone');
        const parent = isIphone ? 'Iphone' : 'Android';
        categoryPath = `Điện Thoại > ${parent} > ${subcat}`;
      } else if (mainCat === 'Linh kiện Laptop') {
        const isMacbook = device.toLowerCase().includes('macbook');
        const parent = isMacbook ? 'Macbook' : 'Laptop Windows';
        categoryPath = `Laptop > ${parent} > ${subcat}`;
      } else if (mainCat === 'Linh kiện Máy tính bảng') {
        const isIpad = device.toLowerCase().includes('ipad');
        const parent = isIpad ? 'Ipad' : 'Tablet';
        categoryPath = `Máy Tính Bảng > ${parent} > ${subcat}`;
      }

      for (const quality of QUALITY_OPTIONS) {
        const cleanDevice = device.replace(/\+/g, ' Plus');
        const name = `${subcat} ${cleanDevice} ${quality}`;
        rows.push({
          'Tên linh kiện': name,
          'Mã hàng': '',
          'Danh mục': categoryPath,
          'Giá vốn': GIA_VON,
          'Giá bán': estimatePrice(subcat, device, quality),
          'NCC': NCC,
          'Tồn kho': TON_KHO,
          'Chất lượng': quality,
          'Loại linh kiện': subcat,
          'Dòng máy tương thích': cleanDevice,
          'Bảo hành tháng': getWarrantyMonths(subcat),
          'Mô tả': '',
          'Ảnh chính': '',
          'Ảnh phụ': '',
        });
      }
    }
  }
}

// ============ CREATE EXCEL ============
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows, {
  header: [
    'Tên linh kiện', 'Mã hàng', 'Danh mục', 'Giá vốn', 'Giá bán',
    'NCC', 'Tồn kho', 'Chất lượng', 'Loại linh kiện',
    'Dòng máy tương thích', 'Bảo hành tháng', 'Mô tả', 'Ảnh chính', 'Ảnh phụ'
  ]
});

// Set column widths
ws['!cols'] = [
  { wch: 45 }, { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 10 },
  { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 25 },
  { wch: 30 }, { wch: 14 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
];

XLSX.utils.book_append_sheet(wb, ws, 'Linh_kien');

const outputPath = 'm:/QLCH_VanLanh/import_linh_kien_vanlanh.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`Done: ${outputPath}`);
console.log(`Total rows: ${rows.length}`);
console.log(`Unique parts: ${rows.length / 4}`);
console.log(`Qualities: ${QUALITY_OPTIONS.join(', ')}`);
