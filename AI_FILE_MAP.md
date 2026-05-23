# AI CONTEXT FILE MAP — Detailed Dependency Reference

Đây là bản đồ file của dự án. AI (như Cursor/Antigravity) sử dụng file này để hiểu context.

### `src/lib/firebase.ts` (lib)
- **Exports**: function getAuthInstance, function getRtdbInstance, function getStorageInstance, variable db, variable default
- **Imported by**: [lib/AuthContext, lib/commissionUtils, lib/ConfigContext, lib/realtimedb, lib/storage, lib/useAdminBadges, lib/useFirestore, lib/warrantyUtils, admin/page, c/admin/MediaManager, c/admin/NotificationBell, c/admin/UniversalProductModal, c/home/ArticleBlock, c/home/BookingSection, c/home/FlashSale, c/home/FloatingReviews, c/home/ServiceBlock, c/home/SuggestedSection, tracking/page, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/login/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/staff/page, admin/technician/page, api/ai/route, api/appointments/route, api/checkout/route, api/products/route, api/reviews/route, api/seed-admin/route, api/seed-config/route, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/receipt/page, admin/settings/repairs/page] (43 direct, 71 transitive)
- **Imports**: [ENV::NEXT_PUBLIC_FIREBASE_API_KEY, ENV::NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, ENV::NEXT_PUBLIC_FIREBASE_PROJECT_ID, ENV::NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, ENV::NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, ENV::NEXT_PUBLIC_FIREBASE_APP_ID, ENV::NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID]

### `src/lib/types.ts` (lib)
- **Exports**: interface User, type FirestoreTimestamp, type FirestoreWriteTimestamp, type FirestoreDateValue, interface Category, interface TaxonomyNode, interface Brand, interface ProductSpecs, interface Product, interface Service, interface OrderItem, interface CustomerInfo, interface Order, interface Article, interface ArticleComment, interface ChatMessage, interface ChatSession, type RepairStatus, type PaymentStatus, interface PaymentHistoryEntry, interface WorkflowNode, interface TrackingGroup, interface StatusTimelineEntry, interface DeviceChecklist, interface RepairIssue, interface GiftItem, interface RepairTicket, interface ImportReceiptItem, interface Review, interface ImportReceipt, interface CommissionRule, interface Commission, interface WarrantyRule, interface Expense, interface InventoryLog
- **Imported by**: [lib/commissionUtils, lib/useAdminBadges, lib/warrantyUtils, lib/workflowFeatures, admin/page, c/admin/MediaManager, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, c/admin/UniversalProductModal, c/home/BookingSection, c/home/FloatingReviews, tracking/page, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/technician/page, category/[...slug]/layout, category/[...slug]/page, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/repairs/page] (32 direct, 42 transitive)

### `src/lib/ConfigContext.tsx` (lib)
- **Exports**: function ConfigProvider, function ServerConfigProvider, function useConfig, interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [not-found, c/ChatWidget, layout.shell, layout, page.client, admin/layout, c/admin/CategoryTaxonomySelector, c/home/BookingSection, c/home/CategoriesSection, c/home/HeroSection, c/layout/Footer, c/layout/Header, c/layout/MobileBottomNav, dao-tao-hoc-vien/page.client, tracking/page, admin/appearance/page, admin/appointments/page, admin/login/page, admin/orders/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/settings/page, api/seed-config/route, service/[id]/ServiceDetailClient, tin-tuc/[slug]/ArticleClientParts] (29 direct, 35 transitive)
- **Imports**: [DATA_STORE::system_config, DATA_STORE::disableImageProxy, lib/firebase, lib/revalidate, lib/config-defaults]

### `src/lib/constants.ts` (lib)
- **Exports**: variable SITE_URL, variable RETAIL_CATEGORIES, type RetailCategory
- **Imported by**: [layout, robots, sitemap, page.client, cart/page, checkout/page, dao-tao-hoc-vien/page.client, rate/page, search/page, tin-tuc/page.client, tracking/page, category/[...slug]/layout, category/[...slug]/page, info/chinh-sach-bao-hanh/page, info/chinh-sach-bao-mat/page, info/chinh-sach-doi-tra/page, info/chinh-sach-mua-hang/page, info/gioi-thieu/page, info/tra-gop/page, product/[id]/layout, product/[id]/page, service/[id]/layout, service/[id]/page, tin-tuc/[slug]/layout, tin-tuc/[slug]/page] (25 direct, 28 transitive)
- **Imports**: [ENV::NEXT_PUBLIC_SITE_URL]

### `src/lib/AuthContext.tsx` (lib)
- **Exports**: function AuthProvider, function useAuth, interface AppUser
- **Imported by**: [layout, c/AuthModal, c/ChatWidget, admin/layout, admin/page, c/layout/MobileBottomNav, admin/commissions/page, admin/inventory/page, admin/login/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/staff/page, admin/technician/page] (17 direct, 20 transitive)
- **Imports**: [DATA_STORE::users, DATA_STORE::has_logged_in, lib/firebase]

### `src/lib/firebaseAdmin.ts` (lib)
- **Exports**: function isAdminAvailable, function getAdminApp, function getAdminAuth, function getAdminDb
- **Imported by**: [layout, sitemap, lib/apiAuth, layout, page, _lib/server-queries, flash-sale/page, reviews/page, api/search/route, product/[id]/layout, service/[id]/layout, tin-tuc/[slug]/layout, api/admin/seed-taxonomy/route, api/analytics/visit/route, api/auth/session/route, api/dev/migrate-prices/route, api/dev/seed-data/route] (17 direct, 26 transitive)

### `src/lib/toast.ts` (lib)
- **Exports**: function toastSuccess, function toastError, function toastWarning
- **Imported by**: [admin/layout, c/admin/UniversalProductModal, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, admin/settings/CategoriesTab, admin/staff/page, admin/technician/page, admin/settings/receipt/page, admin/settings/repairs/page] (17 direct, 18 transitive)

### `DATA_STORE::products` (data_store)
- **Imported by**: [lib/commissionUtils, lib/useFirestore, c/admin/UniversalProductModal, c/home/FlashSale, c/home/SuggestedSection, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/technician/page, api/ai/route, api/checkout/route, api/products/route, admin/inventory/stock/page] (15 direct, 21 transitive)

### `src/lib/useClientPagination.ts` (hook)
- **Exports**: function useClientPagination, variable PAGE_SIZE_OPTIONS, type PageSize
- **Imported by**: [c/admin/PaginationBar, tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[...slug]/CategoryClient, admin/inventory/stock/page] (13 direct, 15 transitive)

### `src/components/admin/Modal.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/services/page, admin/settings/CategoriesTab, admin/staff/page, admin/technician/page, admin/settings/repairs/page] (13 direct, 15 transitive)

### `src/components/admin/PaginationBar.tsx` (component)
- **Exports**: function default
- **Imported by**: [tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[...slug]/CategoryClient, admin/inventory/stock/page] (12 direct, 14 transitive)
- **Imports**: [lib/useClientPagination]

### `DATA_STORE::system_config` (data_store)
- **Imported by**: [lib/ConfigContext, lib/warrantyUtils, tracking/page, admin/parts/page, admin/repairs/page, admin/technician/page, api/reviews/route, api/seed-config/route, admin/settings/receipt/page, admin/settings/repairs/page] (10 direct, 41 transitive)

### `src/components/admin/MediaManager.tsx` (component)
- **Exports**: function default, interface MediaItem, variable MEDIA_FOLDERS
- **Imported by**: [c/admin/UniversalProductModal, admin/appearance/page, admin/articles/page, admin/repairs/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/settings/receipt/page] (8 direct, 12 transitive)
- **Imports**: [DATA_STORE::media_library, lib/firebase, lib/types, lib/imageOptimizer, lib/validateImage, lib/storage, lib/videoOptimizer]

### `src/app/(customer)/_lib/server-queries.ts` (other)
- **Exports**: type SerializedDoc, variable revalidate, variable fetchDynamicCategories, variable fetchTaxonomyConfig, variable fetchNavConfig, variable fetchCategoryItems, variable fetchArticles, variable fetchDetailItem, variable fetchArticleDetail, variable fetchFlashSaleProducts, variable fetchServices
- **Imported by**: [sitemap, flash-sale/page, tin-tuc/page, category/[...slug]/layout, category/[...slug]/page, product/[id]/page, service/[id]/page, tin-tuc/[slug]/page] (8 direct, 8 transitive)
- **Imports**: [DATA_STORE::==, DATA_STORE::desc, EVENT::categories, EVENT::system_config, EVENT::articles, EVENT::products, EVENT::services, lib/firebaseAdmin]

### `src/lib/CartContext.tsx` (lib)
- **Exports**: function CartProvider, function useCart, interface CartItem
- **Imported by**: [not-found, c/CartDrawer, layout.shell, c/layout/Header, cart/page, checkout/page, product/[id]/ProductDetailClient] (7 direct, 9 transitive)

### `src/lib/config-defaults.ts` (lib)
- **Exports**: interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface NavItem, interface SidebarMenuItem, interface FooterServiceLink, interface HomeServiceCategory, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [lib/ConfigContext, layout, page, c/home/CategoriesSection, admin/pos/page, admin/settings/NavigationTab, api/admin/seed-taxonomy/route] (7 direct, 37 transitive)

### `DATA_STORE::orders` (data_store)
- **Imported by**: [lib/useAdminBadges, admin/page, tracking/page, admin/orders/page, admin/pos/page, admin/revenue/page, api/checkout/route] (7 direct, 9 transitive)

### `DATA_STORE::repairs` (data_store)
- **Imported by**: [lib/useAdminBadges, admin/page, tracking/page, admin/parts/page, admin/repairs/page, admin/revenue/page, admin/technician/page] (7 direct, 9 transitive)

### `DATA_STORE::inventory_logs` (data_store)
- **Imported by**: [admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/technician/page, api/checkout/route] (7 direct, 7 transitive)

### `DATA_STORE::users` (data_store)
- **Imported by**: [lib/AuthContext, admin/commissions/page, admin/login/page, admin/repairs/page, admin/staff/page, api/seed-admin/route] (6 direct, 22 transitive)

### `src/lib/storage.ts` (lib)
- **Exports**: function uploadMedia, function uploadImage, function uploadMultipleImages, function deleteImage, function listImagesInFolder, function cleanBrokenMedia
- **Imported by**: [c/admin/MediaManager, rate/page, tracking/page, admin/products/page, admin/repairs/page, admin/services/page] (6 direct, 15 transitive)
- **Imports**: [DATA_STORE::media_library, lib/firebase]

### `DATA_STORE::appointments` (data_store)
- **Imported by**: [lib/useAdminBadges, c/home/BookingSection, tracking/page, admin/appointments/page, admin/repairs/page, api/appointments/route] (6 direct, 10 transitive)

### `EVENT::products` (event)
- **Imported by**: [lib/useFirestore, page, _lib/server-queries, api/search/route, product/[id]/layout, api/dev/seed-data/route] (6 direct, 22 transitive)

### `EVENT::services` (event)
- **Imported by**: [lib/useFirestore, _lib/server-queries, api/search/route, product/[id]/layout, service/[id]/layout, api/dev/migrate-prices/route] (6 direct, 21 transitive)

### `src/lib/utils.ts` (lib)
- **Exports**: function generateSlug, function getCategoryPath, function collectAllNodeIds
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/products/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab] (6 direct, 9 transitive)

### `EVENT::system_config` (event)
- **Imported by**: [layout, layout, page, _lib/server-queries, api/admin/seed-taxonomy/route] (5 direct, 14 transitive)

### `DATA_STORE::==` (data_store)
- **Imported by**: [sitemap, page, _lib/server-queries, reviews/page, api/search/route] (5 direct, 13 transitive)

### `src/lib/revalidate.ts` (lib)
- **Exports**: function triggerRevalidate
- **Imported by**: [lib/ConfigContext, c/admin/UniversalProductModal, admin/articles/page, admin/products/page, admin/services/page] (5 direct, 37 transitive)

### `src/lib/useFirestore.ts` (hook)
- **Exports**: function useFirestoreCollection, function useProducts, function useFlashSaleProducts, function useServices, function useArticles, function useOrders, function addDocument, function addDocumentWithId, function updateDocument, function deleteDocument, function subscribeNewsletter
- **Imported by**: [c/admin/UniversalProductModal, admin/parts/page, admin/products/page, admin/services/page, admin/settings/CategoriesTab] (5 direct, 7 transitive)
- **Imports**: [DATA_STORE::products, DATA_STORE::subscribers, EVENT::products, EVENT::services, EVENT::articles, EVENT::orders, lib/firebase]

### `src/components/admin/CategoryTaxonomySelector.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/admin/UniversalProductModal, admin/parts/page, admin/products/page, admin/repairs/page, admin/services/page] (5 direct, 6 transitive)
- **Imports**: [lib/ConfigContext]

### `DATA_STORE::import_receipts` (data_store)
- **Imported by**: [admin/inventory/page, admin/parts/page, admin/repairs/page, admin/revenue/page, admin/technician/page] (5 direct, 5 transitive)

### `EVENT::articles` (event)
- **Imported by**: [sitemap, lib/useFirestore, _lib/server-queries, tin-tuc/[slug]/layout] (4 direct, 18 transitive)

### `src/lib/permissions.ts` (lib)
- **Exports**: function canStaffAccess, function findFirstAccessibleRoute, type PermissionId, interface PermissionDefinition, variable PERMISSIONS_REGISTRY, variable ROUTE_PERMISSION_MAP
- **Imported by**: [middleware, admin/layout, admin/page, admin/staff/page] (4 direct, 4 transitive)

### `DATA_STORE::reviews` (data_store)
- **Imported by**: [lib/useAdminBadges, c/home/FloatingReviews, admin/reviews/page, api/reviews/route] (4 direct, 8 transitive)

### `src/lib/workflowFeatures.ts` (lib)
- **Exports**: function hasFeature, function getActiveFeatures, function isChecklistComplete, function isYouTubeUrl, function getYouTubeEmbedUrl, function areAllPartsReady, interface WorkflowFeature, variable WORKFLOW_FEATURES, variable CHECKLIST_KEYS, variable CHECKLIST_LABELS
- **Imported by**: [tracking/page, admin/repairs/page, admin/technician/page, admin/settings/repairs/page] (4 direct, 4 transitive)
- **Imports**: [lib/types]

### `src/components/home/ServiceCard.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/home/FlashSale, c/home/SuggestedSection, search/page, category/[...slug]/CategoryClient] (4 direct, 7 transitive)

### `src/components/VideoEmbed.tsx` (component)
- **Exports**: function default
- **Imported by**: [product/[id]/ProductDetailClient, service/[id]/ServiceDetailClient, tin-tuc/[slug]/page] (3 direct, 5 transitive)

### `DATA_STORE::commissions` (data_store)
- **Imported by**: [lib/commissionUtils, admin/commissions/page, admin/revenue/page] (3 direct, 5 transitive)

### `src/lib/icon-map.ts` (lib)
- **Exports**: function getIcon, variable ICON_MAP, variable ICON_NAMES
- **Imported by**: [c/home/HeroSection, c/layout/Header, admin/settings/NavigationTab] (3 direct, 9 transitive)

### `DATA_STORE::media_library` (data_store)
- **Imported by**: [lib/storage, c/admin/MediaManager, admin/articles/page] (3 direct, 16 transitive)

### `src/components/admin/UniversalProductModal.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/parts/page, admin/pos/page, admin/products/page] (3 direct, 3 transitive)
- **Imports**: [DATA_STORE::products, lib/firebase, lib/utils, lib/useFirestore, lib/revalidate, lib/toast, c/admin/Modal, c/admin/MediaManager, c/admin/CategoryTaxonomySelector, lib/types]

### `DATA_STORE::articles` (data_store)
- **Imported by**: [c/home/ArticleBlock, admin/articles/page, tin-tuc/[slug]/ArticleClientParts] (3 direct, 6 transitive)

### `src/components/ui/Skeleton.tsx` (component)
- **Exports**: function Skeleton, function ProductCardSkeleton, function BannerSkeleton, function ServiceCardSkeleton, function BrandLogoSkeleton, function ArticleCardSkeleton, function TableRowSkeleton, function ChatMessageSkeleton
- **Imported by**: [c/home/ServiceBlock, c/ui/LazyImage, category/[...slug]/CategoryClient] (3 direct, 4 transitive)

### `ENV::NODE_ENV` (env)
- **Imported by**: [api/analytics/visit/route, api/auth/session/route, api/dev/seed-data/route] (3 direct, 3 transitive)

### `src/lib/apiAuth.ts` (lib)
- **Exports**: function verifyUser, function requireAdmin, type VerifiedUser
- **Imported by**: [api/seed-config/route, api/admin/ai/route] (2 direct, 2 transitive)
- **Imports**: [EVENT::users, lib/firebaseAdmin]

### `EVENT::users` (event)
- **Imported by**: [lib/apiAuth, api/auth/session/route] (2 direct, 4 transitive)

### `src/lib/commissionUtils.ts` (lib)
- **Exports**: function getActiveRules, function calculateAndSaveCommissions
- **Imported by**: [admin/pos/page, admin/repairs/page] (2 direct, 2 transitive)
- **Imports**: [DATA_STORE::commission_rules, DATA_STORE::products, DATA_STORE::commissions, lib/firebase, lib/types]

### `DATA_STORE::commission_rules` (data_store)
- **Imported by**: [lib/commissionUtils, admin/commissions/page] (2 direct, 4 transitive)

### `DATA_STORE::disableImageProxy` (data_store)
- **Imported by**: [lib/ConfigContext, lib/imageLoader] (2 direct, 37 transitive)

### `src/lib/imageOptimizer.ts` (lib)
- **Exports**: function optimizeImage
- **Imported by**: [c/admin/MediaManager, admin/articles/page] (2 direct, 13 transitive)

### `ENV::OLLAMA_HOST` (env)
- **Imported by**: [lib/ollama, api/admin/ai/route] (2 direct, 2 transitive)

### `ENV::OLLAMA_MODEL` (env)
- **Imported by**: [lib/ollama, api/admin/ai/route] (2 direct, 2 transitive)

### `src/lib/realtimedb.ts` (lib)
- **Exports**: function subscribeToRooms, function subscribeToRoomInfo, function subscribeToMessages, function sendMessage, function updateRoomInfo, function handleAIAutoReply, interface ChatRoomInfo, interface ChatMessage, interface GeminiHistoryItem
- **Imported by**: [c/ChatWidget, admin/chat/page] (2 direct, 4 transitive)
- **Imports**: [lib/firebase]

### `src/lib/sanitizeHtml.ts` (lib)
- **Exports**: function sanitizeHtml
- **Imported by**: [product/[id]/page, tin-tuc/[slug]/page] (2 direct, 2 transitive)

### `src/lib/sessionCookie.ts` (lib)
- **Exports**: function signPayload, function verifyPayload, interface SessionPayload, variable COOKIE_NAME
- **Imported by**: [middleware, api/auth/session/route] (2 direct, 2 transitive)
- **Imports**: [ENV::SESSION_SECRET]

### `src/lib/useAdminBadges.ts` (hook)
- **Exports**: function useAdminBadges, interface AdminBadgeCounts, interface ActivityItem
- **Imported by**: [admin/layout, c/admin/NotificationBell] (2 direct, 2 transitive)
- **Imports**: [DATA_STORE::orders, DATA_STORE::appointments, DATA_STORE::repairs, DATA_STORE::reviews, DATA_STORE::activities, lib/firebase, lib/types]

### `DATA_STORE::activities` (data_store)
- **Imported by**: [lib/useAdminBadges, c/admin/NotificationBell] (2 direct, 3 transitive)

### `src/components/admin/PrintableReceipt.tsx` (component)
- **Exports**: function default, interface ReceiptConfig
- **Imported by**: [c/admin/PrintableRepairInvoice, admin/repairs/page] (2 direct, 2 transitive)
- **Imports**: [lib/types]

### `DATA_STORE::services` (data_store)
- **Imported by**: [c/home/ServiceBlock, admin/repairs/page] (2 direct, 2 transitive)

### `src/components/layout/Footer.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/ConfigContext]

### `src/components/layout/Header.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/ConfigContext, lib/CartContext, lib/icon-map]

### `src/components/layout/MobileBottomNav.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/AuthContext, lib/ConfigContext]

### `DATA_STORE::article_comments` (data_store)
- **Imported by**: [admin/articles/page, tin-tuc/[slug]/ArticleClientParts] (2 direct, 3 transitive)

### `src/components/CartDrawer.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/CartContext]

### `src/components/ChatWidget.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::vanlanh_guest_id, DATA_STORE::vanlanh_customer_info, lib/realtimedb, lib/AuthContext, lib/ConfigContext]

### `DATA_STORE::vanlanh_guest_id` (data_store)
- **Imported by**: [c/ChatWidget] (1 direct, 3 transitive)

### `DATA_STORE::vanlanh_customer_info` (data_store)
- **Imported by**: [c/ChatWidget] (1 direct, 3 transitive)

### `DATA_STORE::has_logged_in` (data_store)
- **Imported by**: [lib/AuthContext] (1 direct, 21 transitive)

### `ENV::NEXT_PUBLIC_SITE_URL` (env)
- **Imported by**: [lib/constants] (1 direct, 29 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_API_KEY` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_PROJECT_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_APP_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 72 transitive)

### `src/lib/gemini.ts` (lib)
- **Exports**: function chatWithGemini, function generateContent, variable geminiModel
- **Imported by**: [api/ai/route] (1 direct, 1 transitive)
- **Imports**: [ENV::GOOGLE_GEMINI_API_KEY]

### `ENV::GOOGLE_GEMINI_API_KEY` (env)
- **Imported by**: [lib/gemini] (1 direct, 2 transitive)

### `src/lib/imageLoader.ts` (lib)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::disableImageProxy]

### `src/lib/ollama.ts` (lib)
- **Exports**: function generateContentStream, function generateContent
- **Imported by**: [api/admin/ai/route] (1 direct, 1 transitive)
- **Imports**: [ENV::OLLAMA_HOST, ENV::OLLAMA_MODEL]

### `ENV::SESSION_SECRET` (env)
- **Imported by**: [lib/sessionCookie] (1 direct, 3 transitive)

### `DATA_STORE::subscribers` (data_store)
- **Imported by**: [lib/useFirestore] (1 direct, 8 transitive)

### `EVENT::orders` (event)
- **Imported by**: [lib/useFirestore] (1 direct, 8 transitive)

### `src/lib/usePresence.ts` (hook)
- **Exports**: function usePresence
- **Imported by**: [layout.shell] (1 direct, 2 transitive)

### `src/lib/validateImage.ts` (lib)
- **Exports**: function validateImageFile, variable MAX_FILE_SIZE, variable ALLOWED_TYPES
- **Imported by**: [c/admin/MediaManager] (1 direct, 13 transitive)

### `src/lib/videoOptimizer.ts` (lib)
- **Exports**: variable loadFfmpeg, variable compressVideo
- **Imported by**: [c/admin/MediaManager] (1 direct, 13 transitive)
- **Imports**: [EVENT::progress]

### `EVENT::progress` (event)
- **Imported by**: [lib/videoOptimizer] (1 direct, 14 transitive)

### `src/lib/warrantyUtils.ts` (lib)
- **Exports**: function stampWarrantyOnParts
- **Imported by**: [admin/repairs/page] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::system_config, lib/firebase, lib/types]

### `src/app/(customer)/layout.shell.tsx` (other)
- **Exports**: function default
- **Imported by**: [layout] (1 direct, 1 transitive)
- **Imports**: [c/layout/Header, lib/CartContext, lib/ConfigContext, lib/usePresence, lib/imageLoader, c/layout/MobileBottomNav, c/layout/Footer, c/CartDrawer, c/ChatWidget, c/home/FloatingReviews]

### `src/app/(customer)/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, c/home/HeroSection, lib/constants, page, c/home/CategoriesSection, c/home/FlashSale, c/home/BookingSection, c/home/ArticleBlock, c/home/SuggestedSection]

### `src/app/(customer)/page.tsx` (page)
- **Exports**: function default, variable dynamic, interface SSRHomeConfig
- **Imported by**: [page.client] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::==, EVENT::system_config, EVENT::products, page.client, lib/firebaseAdmin, lib/config-defaults]

### `DATA_STORE::analytics` (data_store)
- **Imported by**: [admin/page] (1 direct, 1 transitive)

### `src/components/admin/NotificationBell.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/layout] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::activities, lib/firebase, lib/useAdminBadges]

### `src/components/admin/PrintableRepairInvoice.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/repairs/page] (1 direct, 1 transitive)
- **Imports**: [lib/types, c/admin/PrintableReceipt]

### `src/components/home/ArticleBlock.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::articles, lib/firebase]

### `src/components/home/BookingSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::appointments, lib/firebase, lib/ConfigContext, lib/types]

### `src/components/home/CategoriesSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/ConfigContext, lib/config-defaults]

### `src/components/home/FlashSale.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::products, lib/firebase, c/home/ServiceCard]

### `src/components/home/FloatingReviews.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::reviews, lib/firebase, lib/types]

### `src/components/home/HeroSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/ConfigContext, lib/icon-map]

### `src/components/home/SuggestedSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [DATA_STORE::products, lib/firebase, c/home/ServiceCard]

### `DATA_STORE::desc` (data_store)
- **Imported by**: [_lib/server-queries] (1 direct, 9 transitive)

### `EVENT::categories` (event)
- **Imported by**: [_lib/server-queries] (1 direct, 9 transitive)

### `src/app/(customer)/dao-tao-hoc-vien/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [dao-tao-hoc-vien/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, lib/constants]

### `src/app/(customer)/flash-sale/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [flash-sale/page] (1 direct, 1 transitive)

### `EVENT::reviews` (event)
- **Imported by**: [reviews/page] (1 direct, 1 transitive)

### `src/app/(customer)/reviews/ReviewsClient.tsx` (other)
- **Exports**: function default
- **Imported by**: [reviews/page] (1 direct, 1 transitive)

### `src/app/(customer)/tin-tuc/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [tin-tuc/page] (1 direct, 1 transitive)
- **Imports**: [lib/useClientPagination, c/admin/PaginationBar, lib/constants]

### `DATA_STORE::expenses` (data_store)
- **Imported by**: [admin/revenue/page] (1 direct, 1 transitive)

### `src/app/admin/settings/CategoriesTab.tsx` (other)
- **Exports**: function default
- **Imported by**: [admin/settings/page] (1 direct, 1 transitive)
- **Imports**: [lib/useFirestore, lib/types, lib/ConfigContext, c/admin/Modal, c/admin/MediaManager, lib/utils, lib/toast]

### `src/app/admin/settings/NavigationTab.tsx` (other)
- **Exports**: function default
- **Imported by**: [admin/settings/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, lib/config-defaults, lib/types, lib/icon-map, lib/utils, c/admin/MediaManager]

### `ENV::ADMIN_SEED_SECRET` (env)
- **Imported by**: [api/seed-admin/route] (1 direct, 1 transitive)

### `src/app/(customer)/category/[...slug]/CategoryClient.tsx` (other)
- **Exports**: function default
- **Imported by**: [category/[...slug]/page] (1 direct, 1 transitive)
- **Imports**: [c/ui/Skeleton, c/home/ServiceCard, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/(customer)/product/[id]/ProductDetailClient.tsx` (other)
- **Exports**: function default
- **Imported by**: [product/[id]/page] (1 direct, 1 transitive)
- **Imports**: [c/VideoEmbed, lib/CartContext]

### `src/app/(customer)/service/[id]/ServiceDetailClient.tsx` (service)
- **Exports**: function default
- **Imported by**: [service/[id]/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, c/VideoEmbed]

### `src/app/(customer)/tin-tuc/[slug]/ArticleClientParts.tsx` (other)
- **Exports**: function default
- **Imported by**: [tin-tuc/[slug]/page] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::articles, DATA_STORE::article_comments, lib/firebase, lib/types, lib/ConfigContext]

### `DATA_STORE:: ` (data_store)
- **Imported by**: [tin-tuc/[slug]/layout] (1 direct, 1 transitive)

### `EVENT::analytics` (event)
- **Imported by**: [api/analytics/visit/route] (1 direct, 1 transitive)

### `EVENT::visits` (event)
- **Imported by**: [api/analytics/visit/route] (1 direct, 1 transitive)

### `eslint.config.mjs` (config)
- **Exports**: variable default

### `next.config.ts` (config)
- **Exports**: variable default

### `postcss.config.mjs` (config)
- **Exports**: variable default

### `src/middleware.ts` (other)
- **Exports**: function middleware, variable config
- **Imports**: [lib/sessionCookie, lib/permissions]

### `src/app/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default
- **Imports**: [EVENT::system_config, lib/AuthContext, lib/firebaseAdmin, lib/constants]

### `src/app/not-found.tsx` (other)
- **Exports**: function default, variable metadata
- **Imports**: [c/layout/Header, c/layout/Footer, c/layout/MobileBottomNav, lib/CartContext, lib/ConfigContext]

### `src/app/robots.ts` (other)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/sitemap.ts` (other)
- **Exports**: function default, variable revalidate
- **Imports**: [DATA_STORE::==, EVENT::articles, lib/firebaseAdmin, lib/constants, _lib/server-queries]

### `src/components/AuthModal.tsx` (component)
- **Exports**: function default
- **Imports**: [lib/AuthContext]

### `src/app/(customer)/layout.tsx` (layout)
- **Exports**: function default, variable revalidate
- **Imports**: [EVENT::system_config, lib/firebaseAdmin, lib/ConfigContext, lib/config-defaults, layout.shell]

### `src/app/admin/layout.tsx` (layout)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, lib/permissions, lib/AuthContext, c/admin/NotificationBell, lib/toast, lib/useAdminBadges]

### `src/app/admin/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, DATA_STORE::repairs, DATA_STORE::analytics, lib/AuthContext, lib/permissions, lib/firebase, lib/types]

### `src/components/common/Container.tsx` (component)
- **Exports**: function default

### `src/components/home/ServiceBlock.tsx` (component)
- **Exports**: function default
- **Imports**: [DATA_STORE::services, c/ui/Skeleton, lib/firebase]

### `src/components/ui/LazyImage.tsx` (component)
- **Exports**: function LazyImage, function ProductThumbnail, function BannerImage
- **Imports**: [c/ui/Skeleton]

### `src/app/(customer)/cart/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/CartContext, lib/constants]

### `src/app/(customer)/checkout/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/CartContext, lib/constants]

### `src/app/(customer)/dao-tao-hoc-vien/page.tsx` (page)
- **Exports**: function default, variable revalidate
- **Imports**: [dao-tao-hoc-vien/page.client]

### `src/app/(customer)/flash-sale/page.tsx` (page)
- **Exports**: function default, variable revalidate, variable metadata
- **Imports**: [_lib/server-queries, lib/firebaseAdmin, flash-sale/page.client]

### `src/app/(customer)/info/layout.tsx` (layout)
- **Exports**: function default

### `src/app/(customer)/rate/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/storage, lib/constants]

### `src/app/(customer)/reviews/page.tsx` (page)
- **Exports**: function default, variable revalidate
- **Imports**: [DATA_STORE::==, EVENT::reviews, lib/firebaseAdmin, reviews/ReviewsClient]

### `src/app/(customer)/search/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/home/ServiceCard, lib/constants]

### `src/app/(customer)/tin-tuc/page.tsx` (page)
- **Exports**: function default, variable revalidate
- **Imports**: [tin-tuc/page.client, _lib/server-queries]

### `src/app/(customer)/tracking/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, DATA_STORE::appointments, DATA_STORE::repairs, DATA_STORE::orders, lib/firebase, lib/ConfigContext, lib/storage, lib/types, lib/workflowFeatures, lib/constants]

### `src/app/admin/ai-creator/page.tsx` (page)
- **Exports**: function default

### `src/app/admin/appearance/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, c/admin/MediaManager]

### `src/app/admin/appointments/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::appointments, lib/firebase, lib/ConfigContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/articles/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::articles, DATA_STORE::media_library, DATA_STORE::article_comments, lib/firebase, lib/utils, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, lib/imageOptimizer, c/admin/MediaManager, c/admin/Modal]

### `src/app/admin/chat/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/realtimedb]

### `src/app/admin/commissions/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::commission_rules, DATA_STORE::commissions, DATA_STORE::users, c/admin/Modal, lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/inventory/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::import_receipts, DATA_STORE::products, DATA_STORE::inventory_logs, lib/firebase, lib/AuthContext, lib/types, lib/toast]

### `src/app/admin/login/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::users, lib/firebase, lib/AuthContext, lib/ConfigContext]

### `src/app/admin/orders/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, DATA_STORE::products, DATA_STORE::inventory_logs, lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal, lib/firebase, lib/types, lib/AuthContext, lib/ConfigContext]

### `src/app/admin/parts/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, DATA_STORE::import_receipts, DATA_STORE::repairs, DATA_STORE::products, DATA_STORE::inventory_logs, lib/useFirestore, c/admin/CategoryTaxonomySelector, c/admin/Modal, c/admin/UniversalProductModal, lib/types, lib/firebase, lib/AuthContext, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/pos/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::products, DATA_STORE::orders, DATA_STORE::inventory_logs, lib/AuthContext, lib/ConfigContext, c/admin/Modal, c/admin/UniversalProductModal, lib/firebase, lib/types, lib/commissionUtils, lib/toast, lib/config-defaults]

### `src/app/admin/products/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/storage, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/UniversalProductModal, c/admin/CategoryTaxonomySelector, lib/types, lib/ConfigContext, lib/utils]

### `src/app/admin/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::import_receipts, DATA_STORE::repairs, DATA_STORE::system_config, DATA_STORE::users, DATA_STORE::products, DATA_STORE::services, DATA_STORE::appointments, DATA_STORE::inventory_logs, lib/firebase, lib/AuthContext, lib/ConfigContext, lib/types, lib/commissionUtils, lib/storage, lib/workflowFeatures, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, lib/toast, lib/warrantyUtils, lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal, c/admin/CategoryTaxonomySelector, c/admin/MediaManager]

### `src/app/admin/revenue/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, DATA_STORE::repairs, DATA_STORE::import_receipts, DATA_STORE::commissions, DATA_STORE::expenses, c/admin/Modal, lib/firebase, lib/AuthContext, lib/types]

### `src/app/admin/reviews/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::reviews, lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/services/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/storage, lib/utils, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/Modal, c/admin/MediaManager, c/admin/CategoryTaxonomySelector, lib/ConfigContext]

### `src/app/admin/settings/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, admin/settings/CategoriesTab, admin/settings/NavigationTab]

### `src/app/admin/staff/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::users, c/admin/Modal, lib/firebase, lib/AuthContext, lib/toast, lib/permissions]

### `src/app/admin/technician/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::products, DATA_STORE::repairs, DATA_STORE::inventory_logs, DATA_STORE::system_config, DATA_STORE::import_receipts, lib/firebase, lib/AuthContext, lib/workflowFeatures, lib/types, lib/toast, c/admin/Modal]

### `src/app/api/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::products, lib/gemini, lib/firebase]

### `src/app/api/appointments/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::appointments, lib/firebase]

### `src/app/api/checkout/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::products, DATA_STORE::orders, DATA_STORE::inventory_logs, lib/firebase]

### `src/app/api/products/route.ts` (api)
- **Exports**: function GET
- **Imports**: [DATA_STORE::products, lib/firebase]

### `src/app/api/revalidate/route.ts` (api)
- **Exports**: function POST, function GET

### `src/app/api/reviews/route.ts` (api)
- **Exports**: function GET, function POST
- **Imports**: [DATA_STORE::system_config, DATA_STORE::reviews, lib/firebase]

### `src/app/api/search/route.ts` (api)
- **Exports**: function GET
- **Imports**: [DATA_STORE::==, EVENT::products, EVENT::services, lib/firebaseAdmin]

### `src/app/api/seed-admin/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [DATA_STORE::users, ENV::ADMIN_SEED_SECRET, lib/firebase]

### `src/app/api/seed-config/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [DATA_STORE::system_config, lib/firebase, lib/ConfigContext, lib/apiAuth]

### `src/app/(customer)/category/[...slug]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, _lib/server-queries, lib/types]

### `src/app/(customer)/category/[...slug]/page.tsx` (page)
- **Exports**: function generateMetadata, function default
- **Imports**: [_lib/server-queries, category/[...slug]/CategoryClient, lib/constants, lib/types]

### `src/app/(customer)/info/chinh-sach-bao-hanh/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/chinh-sach-bao-mat/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/chinh-sach-doi-tra/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/chinh-sach-mua-hang/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/gioi-thieu/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/tra-gop/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/product/[id]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [EVENT::products, EVENT::services, lib/constants, lib/firebaseAdmin]

### `src/app/(customer)/product/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, lib/sanitizeHtml, _lib/server-queries, product/[id]/ProductDetailClient]

### `src/app/(customer)/service/[id]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [EVENT::services, lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/service/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, _lib/server-queries, service/[id]/ServiceDetailClient]

### `src/app/(customer)/tin-tuc/[slug]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [DATA_STORE:: , EVENT::articles, lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/tin-tuc/[slug]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [c/VideoEmbed, lib/constants, lib/sanitizeHtml, tin-tuc/[slug]/ArticleClientParts, _lib/server-queries]

### `src/app/admin/inventory/stock/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::products, lib/firebase, lib/types, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/settings/receipt/page.tsx` (page)
- **Exports**: function default, interface ReceiptConfig
- **Imports**: [DATA_STORE::system_config, lib/firebase, c/admin/MediaManager, lib/toast]

### `src/app/admin/settings/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, c/admin/Modal, lib/firebase, lib/workflowFeatures, lib/types, lib/toast]

### `src/app/api/admin/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [ENV::OLLAMA_HOST, ENV::OLLAMA_MODEL, lib/ollama, lib/apiAuth]

### `src/app/api/admin/seed-taxonomy/route.ts` (api)
- **Exports**: function GET
- **Imports**: [EVENT::system_config, lib/firebaseAdmin, lib/config-defaults]

### `src/app/api/analytics/visit/route.ts` (api)
- **Exports**: function POST
- **Imports**: [EVENT::analytics, EVENT::visits, ENV::NODE_ENV, lib/firebaseAdmin]

### `src/app/api/auth/session/route.ts` (api)
- **Exports**: function POST, function DELETE
- **Imports**: [EVENT::users, ENV::NODE_ENV, lib/firebaseAdmin, lib/sessionCookie]

### `src/app/api/dev/migrate-prices/route.ts` (api)
- **Exports**: function GET, function POST
- **Imports**: [EVENT::services, lib/firebaseAdmin]

### `src/app/api/dev/seed-data/route.ts` (api)
- **Exports**: function GET
- **Imports**: [EVENT::products, ENV::NODE_ENV, lib/firebaseAdmin]

