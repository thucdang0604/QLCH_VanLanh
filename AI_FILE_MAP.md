# AI CONTEXT FILE MAP — Detailed Dependency Reference

Đây là bản đồ file của dự án. AI (như Cursor/Antigravity) sử dụng file này để hiểu context.

### `src/lib/firebase.ts` (lib)
- **Exports**: variable db, variable rtdb, variable auth, variable storage, variable default
- **Imported by**: [lib/AuthContext, lib/commissionUtils, lib/ConfigContext, lib/realtimedb, lib/storage, lib/useAdminBadges, lib/useFirestore, lib/usePresence, lib/warrantyUtils, page.client, admin/page, c/admin/MediaManager, c/admin/NotificationBell, c/admin/UniversalProductModal, c/home/BookingSection, c/home/FlashSale, c/home/FloatingReviews, c/home/ServiceBlock, tracking/page, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/login/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/staff/page, admin/technician/page, api/ai/route, api/appointments/route, api/checkout/route, api/products/route, api/reviews/route, api/seed-config/route, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/receipt/page, admin/settings/repairs/page] (42 direct, 66 transitive)

### `src/lib/types.ts` (lib)
- **Exports**: interface User, type FirestoreTimestamp, type FirestoreWriteTimestamp, type FirestoreDateValue, interface ProductSpecs, interface Product, interface Service, interface OrderItem, interface CustomerInfo, interface Order, interface Article, interface ArticleComment, interface ChatMessage, interface ChatSession, type RepairStatus, type PaymentStatus, interface WorkflowNode, interface TrackingGroup, interface StatusTimelineEntry, interface DeviceChecklist, interface RepairTicket, interface ImportReceiptItem, interface Review, interface ImportReceipt, interface CommissionRule, interface Commission, interface WarrantyRule, interface Expense
- **Imported by**: [lib/commissionUtils, lib/useAdminBadges, lib/warrantyUtils, lib/workflowFeatures, admin/page, c/admin/MediaManager, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, c/admin/UniversalProductModal, c/home/BookingSection, c/home/FloatingReviews, tracking/page, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/services/page, admin/technician/page, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/repairs/page] (28 direct, 37 transitive)

### `src/lib/constants.ts` (lib)
- **Exports**: variable SITE_URL, variable RETAIL_CATEGORIES, type RetailCategory
- **Imported by**: [layout, robots, sitemap, page.client, cart/page, checkout/page, dao-tao-hoc-vien/page.client, rate/page, search/page, tin-tuc/page.client, tracking/page, admin/products/page, category/[slug]/CategoryClient, category/[slug]/layout, category/[slug]/page, info/chinh-sach-bao-hanh/page, info/chinh-sach-bao-mat/page, info/chinh-sach-doi-tra/page, info/chinh-sach-mua-hang/page, info/gioi-thieu/page, info/tra-gop/page, product/[id]/layout, product/[id]/page, service/[id]/layout, service/[id]/page, tin-tuc/[slug]/layout, tin-tuc/[slug]/page] (27 direct, 30 transitive)

### `src/lib/ConfigContext.tsx` (lib)
- **Exports**: function ConfigProvider, function ServerConfigProvider, function useConfig, interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [not-found, c/ChatWidget, layout.shell, layout, page.client, admin/layout, c/home/BookingSection, c/home/HeroSection, c/layout/Footer, c/layout/Header, c/layout/MobileBottomNav, dao-tao-hoc-vien/page.client, tracking/page, admin/appearance/page, admin/appointments/page, admin/login/page, admin/orders/page, admin/pos/page, admin/repairs/page, admin/settings/page, api/seed-config/route, service/[id]/ServiceDetailClient, tin-tuc/[slug]/ArticleClientParts] (23 direct, 27 transitive)
- **Imports**: [lib/firebase, lib/revalidate, lib/config-defaults]

### `src/lib/AuthContext.tsx` (lib)
- **Exports**: function AuthProvider, function useAuth, interface AppUser
- **Imported by**: [layout, c/AuthModal, c/ChatWidget, admin/layout, admin/page, c/layout/MobileBottomNav, admin/commissions/page, admin/inventory/page, admin/login/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/staff/page, admin/technician/page] (16 direct, 19 transitive)
- **Imports**: [lib/firebase]

### `src/lib/toast.ts` (lib)
- **Exports**: function toastSuccess, function toastError, function toastWarning
- **Imported by**: [admin/layout, c/admin/UniversalProductModal, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, admin/staff/page, admin/technician/page, admin/settings/receipt/page, admin/settings/repairs/page] (16 direct, 16 transitive)

### `src/lib/firebaseAdmin.ts` (lib)
- **Exports**: function isAdminAvailable, function getAdminApp, function getAdminAuth, function getAdminDb
- **Imported by**: [layout, sitemap, lib/apiAuth, layout, page, _lib/server-queries, flash-sale/page, reviews/page, api/search/route, product/[id]/layout, service/[id]/layout, tin-tuc/[slug]/layout, api/dev/seed-data/route] (13 direct, 21 transitive)

### `src/lib/useClientPagination.ts` (hook)
- **Exports**: function useClientPagination, variable PAGE_SIZE_OPTIONS, type PageSize
- **Imported by**: [c/admin/PaginationBar, tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[slug]/CategoryClient, admin/inventory/stock/page] (13 direct, 15 transitive)

### `src/components/admin/Modal.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/services/page, admin/staff/page, admin/technician/page, admin/settings/repairs/page] (13 direct, 14 transitive)

### `src/components/admin/PaginationBar.tsx` (component)
- **Exports**: function default
- **Imported by**: [tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[slug]/CategoryClient, admin/inventory/stock/page] (12 direct, 14 transitive)
- **Imports**: [lib/useClientPagination]

### `src/lib/CartContext.tsx` (lib)
- **Exports**: function CartProvider, function useCart, interface CartItem
- **Imported by**: [not-found, c/CartDrawer, layout.shell, c/layout/Header, cart/page, checkout/page, product/[id]/ProductDetailClient] (7 direct, 9 transitive)

### `src/lib/storage.ts` (lib)
- **Exports**: function uploadMedia, function uploadImage, function uploadMultipleImages, function deleteImage, function listImagesInFolder, function cleanBrokenMedia
- **Imported by**: [c/admin/MediaManager, rate/page, tracking/page, admin/products/page, admin/repairs/page, admin/services/page] (6 direct, 13 transitive)
- **Imports**: [lib/firebase]

### `src/app/(customer)/_lib/server-queries.ts` (lib)
- **Exports**: variable revalidate, variable fetchCategoryItems, variable fetchArticles, variable fetchDetailItem, variable fetchArticleDetail, variable fetchFlashSaleProducts, variable fetchServices
- **Imported by**: [flash-sale/page, tin-tuc/page, category/[slug]/page, product/[id]/page, service/[id]/page, tin-tuc/[slug]/page] (6 direct, 6 transitive)
- **Imports**: [lib/firebaseAdmin]

### `src/lib/revalidate.ts` (lib)
- **Exports**: function triggerRevalidate
- **Imported by**: [lib/ConfigContext, c/admin/UniversalProductModal, admin/articles/page, admin/products/page, admin/services/page] (5 direct, 34 transitive)

### `src/lib/useFirestore.ts` (hook)
- **Exports**: function useFirestoreCollection, function useProducts, function useFlashSaleProducts, function useServices, function useArticles, function useOrders, function addDocument, function addDocumentWithId, function updateDocument, function deleteDocument, function subscribeNewsletter
- **Imported by**: [c/admin/UniversalProductModal, c/home/ArticleBlock, admin/parts/page, admin/products/page, admin/services/page] (5 direct, 9 transitive)
- **Imports**: [lib/firebase]

### `src/components/admin/MediaManager.tsx` (component)
- **Exports**: function default, interface MediaItem, variable MEDIA_FOLDERS
- **Imported by**: [c/admin/UniversalProductModal, admin/appearance/page, admin/articles/page, admin/services/page, admin/settings/receipt/page] (5 direct, 9 transitive)
- **Imports**: [lib/firebase, lib/types, lib/imageOptimizer, lib/validateImage, lib/storage]

### `src/lib/workflowFeatures.ts` (lib)
- **Exports**: function hasFeature, function getActiveFeatures, function isChecklistComplete, function isYouTubeUrl, function getYouTubeEmbedUrl, function areAllPartsReady, interface WorkflowFeature, variable WORKFLOW_FEATURES, variable CHECKLIST_KEYS, variable CHECKLIST_LABELS
- **Imported by**: [tracking/page, admin/repairs/page, admin/technician/page, admin/settings/repairs/page] (4 direct, 4 transitive)
- **Imports**: [lib/types]

### `src/components/admin/UniversalProductModal.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/inventory/page, admin/parts/page, admin/pos/page, admin/products/page] (4 direct, 4 transitive)
- **Imports**: [lib/firebase, lib/utils, lib/useFirestore, lib/revalidate, lib/toast, c/admin/Modal, c/admin/MediaManager, lib/types]

### `src/components/home/ServiceCard.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client, c/home/FlashSale, search/page, category/[slug]/CategoryClient] (4 direct, 6 transitive)

### `src/components/VideoEmbed.tsx` (component)
- **Exports**: function default
- **Imported by**: [product/[id]/ProductDetailClient, service/[id]/ServiceDetailClient, tin-tuc/[slug]/page] (3 direct, 5 transitive)

### `src/lib/commissionUtils.ts` (lib)
- **Exports**: function getActiveRules, function calculateAndSaveCommissions
- **Imported by**: [admin/pos/page, admin/repairs/page, admin/technician/page] (3 direct, 3 transitive)
- **Imports**: [lib/firebase, lib/types]

### `src/lib/config-defaults.ts` (lib)
- **Exports**: interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [lib/ConfigContext, layout, page] (3 direct, 28 transitive)

### `src/lib/utils.ts` (lib)
- **Exports**: function generateSlug
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/parts/page] (3 direct, 6 transitive)

### `src/components/ui/Skeleton.tsx` (component)
- **Exports**: function Skeleton, function ProductCardSkeleton, function BannerSkeleton, function ServiceCardSkeleton, function BrandLogoSkeleton, function ArticleCardSkeleton, function TableRowSkeleton, function ChatMessageSkeleton
- **Imported by**: [c/home/ServiceBlock, c/ui/LazyImage, category/[slug]/CategoryClient] (3 direct, 4 transitive)

### `src/lib/apiAuth.ts` (lib)
- **Exports**: function verifyUser, function requireAdmin, type VerifiedUser
- **Imported by**: [api/seed-config/route, api/admin/ai/route] (2 direct, 2 transitive)
- **Imports**: [lib/firebaseAdmin]

### `src/lib/imageOptimizer.ts` (lib)
- **Exports**: function optimizeImage
- **Imported by**: [c/admin/MediaManager, admin/articles/page] (2 direct, 10 transitive)

### `src/lib/realtimedb.ts` (lib)
- **Exports**: function subscribeToRooms, function subscribeToRoomInfo, function subscribeToMessages, function sendMessage, function updateRoomInfo, function handleAIAutoReply, interface ChatRoomInfo, interface ChatMessage, interface GeminiHistoryItem
- **Imported by**: [c/ChatWidget, admin/chat/page] (2 direct, 4 transitive)
- **Imports**: [lib/firebase]

### `src/lib/useAdminBadges.ts` (hook)
- **Exports**: function useAdminBadges, interface AdminBadgeCounts, interface ActivityItem
- **Imported by**: [admin/layout, c/admin/NotificationBell] (2 direct, 2 transitive)
- **Imports**: [lib/firebase, lib/types]

### `src/lib/warrantyUtils.ts` (lib)
- **Exports**: function stampWarrantyOnParts
- **Imported by**: [admin/repairs/page, admin/technician/page] (2 direct, 2 transitive)
- **Imports**: [lib/firebase, lib/types]

### `src/components/admin/PrintableReceipt.tsx` (component)
- **Exports**: function default, interface ReceiptConfig
- **Imported by**: [c/admin/PrintableRepairInvoice, admin/repairs/page] (2 direct, 2 transitive)
- **Imports**: [lib/types]

### `src/components/layout/Footer.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/ConfigContext]

### `src/components/layout/Header.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/ConfigContext, lib/CartContext]

### `src/components/layout/MobileBottomNav.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/AuthContext, lib/ConfigContext]

### `src/components/CartDrawer.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/CartContext]

### `src/components/ChatWidget.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/realtimedb, lib/AuthContext, lib/ConfigContext]

### `src/lib/gemini.ts` (lib)
- **Exports**: function chatWithGemini, function generateContent, variable geminiModel
- **Imported by**: [api/ai/route] (1 direct, 1 transitive)

### `src/lib/ollama.ts` (lib)
- **Exports**: function generateContentStream, function generateContent
- **Imported by**: [api/admin/ai/route] (1 direct, 1 transitive)

### `src/lib/usePresence.ts` (hook)
- **Exports**: function usePresence
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/firebase]

### `src/lib/validateImage.ts` (lib)
- **Exports**: function validateImageFile, variable MAX_FILE_SIZE, variable ALLOWED_TYPES
- **Imported by**: [c/admin/MediaManager] (1 direct, 10 transitive)

### `src/app/(customer)/layout.shell.tsx` (other)
- **Exports**: function default
- **Imported by**: [layout] (1 direct, 1 transitive)
- **Imports**: [c/layout/Header, c/layout/Footer, c/layout/MobileBottomNav, lib/CartContext, lib/ConfigContext, lib/usePresence, c/CartDrawer, c/ChatWidget, c/home/FloatingReviews]

### `src/app/(customer)/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [page] (1 direct, 1 transitive)
- **Imports**: [lib/firebase, lib/ConfigContext, c/home/HeroSection, c/home/ServiceCard, lib/constants, page, c/home/FlashSale, c/home/BookingSection, c/home/ArticleBlock]

### `src/app/(customer)/page.tsx` (page)
- **Exports**: function default, variable revalidate, interface SSRHomeConfig
- **Imported by**: [page.client] (1 direct, 1 transitive)
- **Imports**: [page.client, lib/firebaseAdmin, lib/config-defaults]

### `src/components/admin/NotificationBell.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/layout] (1 direct, 1 transitive)
- **Imports**: [lib/firebase, lib/useAdminBadges]

### `src/components/admin/PrintableRepairInvoice.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/repairs/page] (1 direct, 1 transitive)
- **Imports**: [lib/types, c/admin/PrintableReceipt]

### `src/components/home/ArticleBlock.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/useFirestore]

### `src/components/home/BookingSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/firebase, lib/ConfigContext, lib/types]

### `src/components/home/FlashSale.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/firebase, c/home/ServiceCard]

### `src/components/home/FloatingReviews.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/firebase, lib/types]

### `src/components/home/HeroSection.tsx` (component)
- **Exports**: function default
- **Imported by**: [page.client] (1 direct, 2 transitive)
- **Imports**: [lib/ConfigContext]

### `src/app/(customer)/dao-tao-hoc-vien/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [dao-tao-hoc-vien/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, lib/constants]

### `src/app/(customer)/flash-sale/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [flash-sale/page] (1 direct, 1 transitive)

### `src/app/(customer)/reviews/ReviewsClient.tsx` (view)
- **Exports**: function default
- **Imported by**: [reviews/page] (1 direct, 1 transitive)

### `src/app/(customer)/tin-tuc/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [tin-tuc/page] (1 direct, 1 transitive)
- **Imports**: [lib/useClientPagination, c/admin/PaginationBar, lib/constants]

### `src/app/(customer)/category/[slug]/CategoryClient.tsx` (other)
- **Exports**: function default
- **Imported by**: [category/[slug]/page] (1 direct, 1 transitive)
- **Imports**: [c/ui/Skeleton, c/home/ServiceCard, lib/useClientPagination, c/admin/PaginationBar, lib/constants]

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
- **Imports**: [lib/firebase, lib/types, lib/ConfigContext]

### `eslint.config.mjs` (config)
- **Exports**: variable default

### `next.config.ts` (config)
- **Exports**: variable default

### `postcss.config.mjs` (config)
- **Exports**: variable default

### `src/app/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default
- **Imports**: [lib/AuthContext, lib/firebaseAdmin, lib/constants]

### `src/app/not-found.tsx` (other)
- **Exports**: function default, variable metadata
- **Imports**: [c/layout/Header, c/layout/Footer, c/layout/MobileBottomNav, lib/CartContext, lib/ConfigContext]

### `src/app/robots.ts` (other)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/sitemap.ts` (other)
- **Exports**: function default, variable revalidate
- **Imports**: [lib/firebaseAdmin, lib/constants]

### `src/components/AuthModal.tsx` (component)
- **Exports**: function default
- **Imports**: [lib/AuthContext]

### `src/lib/imageLoader.ts` (lib)
- **Exports**: function default

### `src/app/(customer)/layout.tsx` (layout)
- **Exports**: function default
- **Imports**: [lib/firebaseAdmin, lib/ConfigContext, lib/config-defaults, layout.shell]

### `src/app/admin/layout.tsx` (layout)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, lib/AuthContext, c/admin/NotificationBell, lib/toast, lib/useAdminBadges]

### `src/app/admin/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/AuthContext, lib/firebase, lib/types]

### `src/components/common/Container.tsx` (component)
- **Exports**: function default

### `src/components/home/ServiceBlock.tsx` (component)
- **Exports**: function default
- **Imports**: [c/ui/Skeleton, lib/firebase]

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
- **Imports**: [lib/firebaseAdmin, reviews/ReviewsClient]

### `src/app/(customer)/search/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/home/ServiceCard, lib/constants]

### `src/app/(customer)/tin-tuc/page.tsx` (page)
- **Exports**: function default, variable revalidate
- **Imports**: [tin-tuc/page.client, _lib/server-queries]

### `src/app/(customer)/tracking/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/ConfigContext, lib/storage, lib/types, lib/workflowFeatures, lib/constants]

### `src/app/admin/ai-creator/page.tsx` (page)
- **Exports**: function default

### `src/app/admin/appearance/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, c/admin/MediaManager]

### `src/app/admin/appointments/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/ConfigContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/articles/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/utils, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, lib/imageOptimizer, c/admin/MediaManager, c/admin/Modal]

### `src/app/admin/chat/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/realtimedb]

### `src/app/admin/commissions/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/admin/Modal, lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/inventory/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/admin/Modal, c/admin/UniversalProductModal, lib/firebase, lib/AuthContext, lib/types, lib/toast]

### `src/app/admin/login/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/AuthContext, lib/ConfigContext]

### `src/app/admin/orders/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal, lib/firebase, lib/types, lib/ConfigContext]

### `src/app/admin/parts/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/utils, c/admin/Modal, c/admin/UniversalProductModal, lib/types, lib/firebase, lib/AuthContext, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/pos/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/AuthContext, lib/ConfigContext, c/admin/Modal, c/admin/UniversalProductModal, lib/firebase, lib/types, lib/commissionUtils, lib/toast]

### `src/app/admin/products/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/storage, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/UniversalProductModal, lib/constants]

### `src/app/admin/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/AuthContext, lib/ConfigContext, lib/types, lib/commissionUtils, lib/storage, lib/workflowFeatures, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, lib/toast, lib/warrantyUtils, lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal]

### `src/app/admin/revenue/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/admin/Modal, lib/firebase, lib/AuthContext, lib/types]

### `src/app/admin/reviews/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/services/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/storage, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/Modal, c/admin/MediaManager]

### `src/app/admin/settings/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/ConfigContext]

### `src/app/admin/staff/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/admin/Modal, lib/firebase, lib/AuthContext, lib/toast]

### `src/app/admin/technician/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/AuthContext, lib/workflowFeatures, lib/commissionUtils, lib/types, lib/toast, c/admin/Modal, lib/warrantyUtils]

### `src/app/api/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/gemini, lib/firebase]

### `src/app/api/appointments/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebase]

### `src/app/api/checkout/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebase]

### `src/app/api/products/route.ts` (api)
- **Exports**: function GET
- **Imports**: [lib/firebase]

### `src/app/api/reviews/route.ts` (view)
- **Exports**: function GET, function POST
- **Imports**: [lib/firebase]

### `src/app/api/search/route.ts` (api)
- **Exports**: function GET
- **Imports**: [lib/firebaseAdmin]

### `src/app/api/seed-config/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [lib/firebase, lib/ConfigContext, lib/apiAuth]

### `src/app/(customer)/category/[slug]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants]

### `src/app/(customer)/category/[slug]/page.tsx` (page)
- **Exports**: function generateMetadata, function default
- **Imports**: [_lib/server-queries, category/[slug]/CategoryClient, lib/constants]

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
- **Imports**: [lib/constants, lib/firebaseAdmin]

### `src/app/(customer)/product/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, _lib/server-queries, product/[id]/ProductDetailClient]

### `src/app/(customer)/service/[id]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/service/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, _lib/server-queries, service/[id]/ServiceDetailClient]

### `src/app/(customer)/tin-tuc/[slug]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/tin-tuc/[slug]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [c/VideoEmbed, lib/constants, tin-tuc/[slug]/ArticleClientParts, _lib/server-queries]

### `src/app/admin/inventory/stock/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase, lib/types, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/settings/receipt/page.tsx` (page)
- **Exports**: function default, interface ReceiptConfig
- **Imports**: [lib/firebase, c/admin/MediaManager, lib/toast]

### `src/app/admin/settings/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/admin/Modal, lib/firebase, lib/workflowFeatures, lib/types, lib/toast]

### `src/app/api/admin/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/ollama, lib/apiAuth]

### `src/app/api/dev/seed-data/route.ts` (api)
- **Exports**: function GET
- **Imports**: [lib/firebaseAdmin]

