# AI CONTEXT FILE MAP — Detailed Dependency Reference

Đây là bản đồ file của dự án. AI (như Cursor/Antigravity) sử dụng file này để hiểu context.

### `src/lib/firebase.ts` (lib)
- **Exports**: function getAuthInstance, function getRtdbInstance, function getStorageInstance, variable db, variable default
- **Imported by**: [c/ChatWidget, lib/AuthContext, lib/commissionUtils, lib/ConfigContext, lib/discountRuleUtils, lib/realtimedb, lib/storage, lib/useAdminBadges, lib/useCustomerActivity, lib/useFirestore, lib/warrantyUtils, admin/page, c/admin/ExcelImportModal, c/admin/ExportImportReportButton, c/admin/MediaManager, c/admin/NotificationBell, c/admin/UniversalProductModal, c/home/ArticleBlock, c/home/BookingSection, c/home/FlashSale, c/home/FloatingReviews, c/home/ServiceBlock, c/home/SuggestedSection, tracking/page, admin/ai-creator/page, admin/appointments/page, admin/articles/page, admin/chat/page, admin/commissions/page, admin/customers/page, admin/inventory/page, admin/login/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/settings/page, admin/staff/page, admin/suppliers/page, admin/technician/page, api/ai/route, api/products/route, api/reviews/route, api/seed-admin/route, api/seed-config/route, c/admin/chat/ChatCustomerProfileModal, c/admin/customers/CustomerDetailDrawer, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/discount-rules/page, admin/settings/integrations/page, admin/settings/receipt/page, admin/settings/repairs/page] (55 direct, 81 transitive)
- **Imports**: [ENV::NEXT_PUBLIC_FIREBASE_API_KEY, ENV::NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, ENV::NEXT_PUBLIC_FIREBASE_PROJECT_ID, ENV::NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, ENV::NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, ENV::NEXT_PUBLIC_FIREBASE_APP_ID, ENV::NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID]

### `src/lib/types.ts` (lib)
- **Exports**: interface User, type FirestoreTimestamp, type FirestoreWriteTimestamp, type FirestoreDateValue, interface Category, interface TaxonomyNode, interface Brand, interface ProductSpecs, interface Product, interface Service, interface OrderItem, interface CustomerInfo, interface Order, interface Article, interface ArticleComment, interface ChatMessage, interface ChatSession, type RepairStatus, type PaymentStatus, interface PaymentHistoryEntry, interface WorkflowNode, interface TrackingGroup, interface StatusTimelineEntry, interface DeviceChecklist, interface RepairIssue, interface GiftItem, interface RepairWorkflowConfig, interface RepairTicket, interface ImportReceiptItem, interface Review, interface ImportReceipt, interface CommissionRule, interface Commission, interface WarrantyRule, interface Expense, interface InventoryLog, interface Supplier, interface SupplierTransaction, interface AccessoryDiscountRule, interface ProductReview
- **Imported by**: [lib/commissionCalcServer, lib/commissionUtils, lib/discountCalc, lib/discountRuleUtils, lib/useAdminBadges, lib/useCustomerActivity, lib/warrantyUtils, lib/workflowFeatures, admin/page, c/admin/ExcelImportModal, c/admin/MediaManager, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, c/admin/UniversalProductModal, c/home/BookingSection, c/home/FloatingReviews, tracking/page, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/suppliers/page, admin/technician/page, category/[...slug]/layout, category/[...slug]/page, tin-tuc/[slug]/ArticleClientParts, admin/inventory/stock/page, admin/settings/discount-rules/page, admin/settings/repairs/page, api/inventory/import/route, api/orders/assign-seller/route, api/orders/transition/route, api/pos/checkout/route, api/repairs/confirm-parts/route, api/repairs/handover/route, api/repairs/payment-edit/route, api/repairs/transition/route] (47 direct, 61 transitive)

### `src/lib/constants.ts` (lib)
- **Exports**: variable SITE_URL, variable PART_CATEGORY, variable PART_CATEGORY_LABEL, variable RETAIL_CATEGORIES, type RetailCategory, variable isPartCategory
- **Imported by**: [layout, robots, sitemap, page.client, c/admin/UniversalProductModal, cart/page, checkout/page, dao-tao-hoc-vien/page.client, rate/page, search/page, tin-tuc/page.client, tracking/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/technician/page, category/[...slug]/layout, category/[...slug]/page, info/chinh-sach-bao-hanh/page, info/chinh-sach-bao-mat/page, info/chinh-sach-doi-tra/page, info/chinh-sach-mua-hang/page, info/dieu-khoan-dich-vu/page, info/gioi-thieu/page, info/tra-gop/page, info/xoa-du-lieu-nguoi-dung/page, product/[id]/layout, product/[id]/page, service/[id]/layout, service/[id]/page, tin-tuc/[slug]/layout, tin-tuc/[slug]/page] (33 direct, 36 transitive)
- **Imports**: [ENV::NEXT_PUBLIC_SITE_URL]

### `src/lib/firebaseAdmin.ts` (lib)
- **Exports**: function isAdminAvailable, function getAdminApp, function getAdminAuth, function getAdminDb, function getAdminRtdb, function getAdminStorage
- **Imported by**: [layout, sitemap, lib/apiAuth, lib/chatIntegrationConfig, lib/chatServer, lib/rateLimit, layout, page, _lib/server-queries, flash-sale/page, reviews/page, api/appointments/route, api/checkout/route, api/search/route, api/tracking/route, product/[id]/layout, service/[id]/layout, tin-tuc/[slug]/layout, api/admin/seed-taxonomy/route, api/analytics/visit/route, api/auth/session/route, api/inventory/import/route, api/orders/assign-seller/route, api/orders/transition/route, api/pos/checkout/route, api/repairs/confirm-parts/route, api/repairs/handover/route, api/repairs/payment-edit/route, api/repairs/transition/route, api/admin/chat/integrations/route, api/admin/chat/rooms/[roomId]/customer/route, api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route] (32 direct, 49 transitive)

### `src/lib/ConfigContext.tsx` (lib)
- **Exports**: function ConfigProvider, function ServerConfigProvider, function useConfig, interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [not-found, c/ChatWidget, layout.shell, layout, page.client, admin/layout, c/admin/CategoryTaxonomySelector, c/admin/ExcelImportModal, c/home/BookingSection, c/home/CategoriesSection, c/home/HeroSection, c/layout/Footer, c/layout/Header, c/layout/MobileBottomNav, dao-tao-hoc-vien/page.client, tracking/page, admin/appearance/page, admin/appointments/page, admin/login/page, admin/orders/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/settings/page, api/seed-config/route, service/[id]/ServiceDetailClient] (29 direct, 34 transitive)
- **Imports**: [DATA_STORE::system_config, DATA_STORE::disableImageProxy, lib/firebase, lib/revalidate, lib/config-defaults]

### `src/lib/AuthContext.tsx` (lib)
- **Exports**: function AuthProvider, function useAuth, interface AppUser
- **Imported by**: [layout, c/AuthModal, c/ChatWidget, admin/layout, admin/page, c/admin/ExcelImportModal, c/layout/MobileBottomNav, admin/chat/page, admin/commissions/page, admin/inventory/page, admin/login/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/reviews/page, admin/staff/page, admin/suppliers/page, admin/technician/page, c/admin/chat/ChatCustomerProfileModal, c/admin/customers/CustomerDetailDrawer] (22 direct, 28 transitive)
- **Imports**: [DATA_STORE::users, DATA_STORE::has_logged_in, lib/firebase]

### `src/lib/toast.ts` (lib)
- **Exports**: function toastSuccess, function toastError, function toastWarning
- **Imported by**: [admin/layout, c/admin/UniversalProductModal, admin/appointments/page, admin/articles/page, admin/chat/page, admin/commissions/page, admin/inventory/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, admin/settings/CategoriesTab, admin/staff/page, admin/technician/page, c/admin/chat/ChatCustomerProfileModal, admin/settings/receipt/page, admin/settings/repairs/page] (20 direct, 22 transitive)

### `src/lib/apiAuth.ts` (lib)
- **Exports**: function verifyUser, function requireAdminOrStaff, function requireAdmin, function requirePermission, type VerifiedUser
- **Imported by**: [api/seed-config/route, api/admin/ai/route, api/admin/seed-taxonomy/route, api/inventory/import/route, api/orders/assign-seller/route, api/orders/transition/route, api/pos/checkout/route, api/repairs/confirm-parts/route, api/repairs/handover/route, api/repairs/payment-edit/route, api/repairs/transition/route, api/admin/chat/integrations/route, api/admin/chat/quick-replies/route, api/admin/chat/send/route, api/integrations/facebook/webhook/test/route, api/admin/chat/rooms/[roomId]/customer/route, api/admin/chat/rooms/[roomId]/facebook-profile/route, api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route] (18 direct, 18 transitive)
- **Imports**: [lib/firebaseAdmin, lib/permissions]

### `DATA_STORE::products` (data_store)
- **Imported by**: [lib/commissionUtils, lib/useFirestore, c/admin/ExcelImportModal, c/admin/UniversalProductModal, c/home/FlashSale, c/home/SuggestedSection, admin/inventory/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/technician/page, api/ai/route, api/products/route, admin/inventory/stock/page] (14 direct, 20 transitive)

### `src/lib/useClientPagination.ts` (hook)
- **Exports**: function useClientPagination, variable PAGE_SIZE_OPTIONS, type PageSize
- **Imported by**: [c/admin/PaginationBar, tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/customers/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[...slug]/CategoryClient, admin/inventory/stock/page] (14 direct, 16 transitive)

### `src/components/admin/Modal.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/commissions/page, admin/orders/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/services/page, admin/settings/CategoriesTab, admin/staff/page, admin/technician/page, c/admin/chat/ChatCustomerProfileModal, admin/settings/repairs/page] (14 direct, 18 transitive)

### `DATA_STORE::system_config` (data_store)
- **Imported by**: [lib/ConfigContext, lib/useCustomerActivity, lib/warrantyUtils, tracking/page, admin/customers/page, admin/parts/page, admin/repairs/page, admin/technician/page, api/reviews/route, api/seed-config/route, admin/settings/discount-rules/page, admin/settings/receipt/page, admin/settings/repairs/page] (13 direct, 46 transitive)

### `src/components/admin/PaginationBar.tsx` (component)
- **Exports**: function default
- **Imported by**: [tin-tuc/page.client, admin/appointments/page, admin/articles/page, admin/commissions/page, admin/customers/page, admin/orders/page, admin/parts/page, admin/products/page, admin/repairs/page, admin/reviews/page, admin/services/page, category/[...slug]/CategoryClient, admin/inventory/stock/page] (13 direct, 15 transitive)
- **Imports**: [lib/useClientPagination]

### `DATA_STORE::==` (data_store)
- **Imported by**: [sitemap, lib/commissionCalcServer, page, _lib/server-queries, reviews/page, api/search/route, api/tracking/route, api/repairs/confirm-parts/route] (8 direct, 19 transitive)

### `src/components/admin/CurrencyInput.tsx` (component)
- **Exports**: function formatVND, function parseVND, function default
- **Imported by**: [c/admin/UniversalProductModal, admin/commissions/page, admin/parts/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/services/page, admin/suppliers/page] (8 direct, 9 transitive)

### `src/components/admin/MediaManager.tsx` (component)
- **Exports**: function default, interface MediaItem, variable MEDIA_FOLDERS
- **Imported by**: [c/admin/UniversalProductModal, admin/appearance/page, admin/articles/page, admin/repairs/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab, admin/settings/receipt/page] (8 direct, 12 transitive)
- **Imports**: [DATA_STORE::media_library, lib/firebase, lib/types, lib/imageOptimizer, lib/validateImage, lib/storage, lib/videoOptimizer]

### `src/app/(customer)/_lib/server-queries.ts` (other)
- **Exports**: type SerializedDoc, variable revalidate, variable fetchDynamicCategories, variable fetchTaxonomyConfig, variable fetchNavConfig, variable fetchCategoryItems, variable fetchArticles, variable fetchDetailItem, variable fetchArticleDetail, variable fetchFlashSaleProducts, variable fetchServices, variable fetchProductVariants, variable fetchProductReviews
- **Imported by**: [sitemap, flash-sale/page, tin-tuc/page, category/[...slug]/layout, category/[...slug]/page, product/[id]/page, service/[id]/page, tin-tuc/[slug]/page] (8 direct, 8 transitive)
- **Imports**: [DATA_STORE::==, DATA_STORE::desc, lib/firebaseAdmin]

### `src/lib/CartContext.tsx` (lib)
- **Exports**: function CartProvider, function useCart, interface CartItem
- **Imported by**: [not-found, c/CartDrawer, layout.shell, c/layout/Header, cart/page, checkout/page, product/[id]/ProductDetailClient] (7 direct, 9 transitive)

### `src/lib/config-defaults.ts` (lib)
- **Exports**: interface HeroBanner, interface BackgroundConfig, interface StoreBranch, interface SectionBackground, interface HomeSectionItem, interface ContactInfo, interface GeofenceConfig, interface NavItem, interface SidebarMenuItem, interface FooterServiceLink, interface HomeServiceCategory, interface SiteConfig, variable DEFAULT_CONFIG
- **Imported by**: [lib/ConfigContext, layout, page, c/home/CategoriesSection, admin/pos/page, admin/settings/NavigationTab, api/admin/seed-taxonomy/route] (7 direct, 36 transitive)

### `src/lib/rateLimit.ts` (lib)
- **Exports**: function isRateLimited
- **Imported by**: [api/ai/route, api/appointments/route, api/checkout/route, api/reviews/route, api/search/route, api/admin/ai/route, api/analytics/visit/route] (7 direct, 7 transitive)
- **Imports**: [lib/firebaseAdmin]

### `src/lib/revalidate.ts` (lib)
- **Exports**: function triggerRevalidate
- **Imported by**: [lib/ConfigContext, c/admin/UniversalProductModal, admin/articles/page, admin/products/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab] (7 direct, 36 transitive)
- **Imports**: [ENV::REVALIDATE_SECRET]

### `DATA_STORE::repairs` (data_store)
- **Imported by**: [lib/useAdminBadges, lib/useCustomerActivity, admin/page, admin/pos/page, admin/repairs/page, admin/revenue/page, admin/technician/page] (7 direct, 13 transitive)

### `DATA_STORE::users` (data_store)
- **Imported by**: [lib/AuthContext, admin/commissions/page, admin/login/page, admin/repairs/page, admin/staff/page, api/seed-admin/route] (6 direct, 30 transitive)

### `src/lib/chatChannels.ts` (lib)
- **Exports**: function normalizeChatChannel, function getChatChannelLabel, function isExternalChatChannel, function toSafeRtdbKey, function buildExternalChatRoomId, type ChatChannel, variable CHAT_CHANNEL_LABELS
- **Imported by**: [lib/chatServer, lib/realtimedb, admin/chat/page, c/admin/chat/ChatCustomerProfileModal, api/admin/chat/rooms/[roomId]/customer/route, api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route] (6 direct, 15 transitive)

### `src/lib/chatIntegrationConfig.ts` (lib)
- **Exports**: function getStoredChatIntegrationConfig, function getEffectiveChatIntegrationConfig, function saveChatIntegrationConfig, function toPublicChatIntegrationConfig, interface FacebookChatConfig, interface ZaloChatConfig, interface ChatQuickReply, interface ChatIntegrationConfig, interface ChatIntegrationConfigPatch, interface PublicChatIntegrationConfig, variable DEFAULT_CHAT_INTEGRATION_CONFIG
- **Imported by**: [lib/chatServer, api/admin/chat/integrations/route, api/admin/chat/quick-replies/route, api/integrations/facebook/webhook/route, api/integrations/zalo/webhook/route, api/integrations/facebook/webhook/test/route] (6 direct, 9 transitive)
- **Imports**: [ENV::FACEBOOK_PAGE_ACCESS_TOKEN, ENV::META_PAGE_ACCESS_TOKEN, ENV::FACEBOOK_APP_SECRET, ENV::META_APP_SECRET, ENV::FACEBOOK_WEBHOOK_VERIFY_TOKEN, ENV::META_WEBHOOK_VERIFY_TOKEN, ENV::ZALO_OA_ACCESS_TOKEN, ENV::ZALO_WEBHOOK_SECRET, ENV::ZALO_WEBHOOK_TOKEN, ENV::FACEBOOK_PAGE_ID, ENV::META_PAGE_ID, ENV::FACEBOOK_GRAPH_VERSION, ENV::META_GRAPH_VERSION, ENV::ZALO_OA_ID, lib/firebaseAdmin]

### `src/lib/chatServer.ts` (lib)
- **Exports**: function isAllowedFacebookMediaUrl, function fetchFacebookUserProfile, function syncFacebookRoomProfile, function upsertExternalInboundMessage, function sendAdminChatMessage, interface ChatAttachment, interface UpsertExternalMessageInput, interface AdminChatSendInput, interface FacebookUserProfile
- **Imported by**: [api/admin/chat/send/route, api/integrations/facebook/webhook/route, api/integrations/zalo/webhook/route, api/integrations/facebook/webhook/test/route, api/admin/chat/rooms/[roomId]/facebook-profile/route, api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route] (6 direct, 6 transitive)
- **Imports**: [lib/firebaseAdmin, lib/chatChannels, lib/chatIntegrationConfig]

### `src/lib/utils.ts` (lib)
- **Exports**: function generateSlug, function getCategoryPath, function collectAllNodeIds, function generateSearchKeywords
- **Imported by**: [c/admin/UniversalProductModal, admin/articles/page, admin/products/page, admin/services/page, admin/settings/CategoriesTab, admin/settings/NavigationTab] (6 direct, 9 transitive)

### `ENV::NODE_ENV` (env)
- **Imported by**: [api/seed-admin/route, api/admin/seed-taxonomy/route, api/analytics/visit/route, api/auth/session/route, api/integrations/facebook/webhook/route, api/integrations/zalo/webhook/route] (6 direct, 6 transitive)

### `src/lib/permissions.ts` (lib)
- **Exports**: function canStaffAccess, function findFirstAccessibleRoute, type PermissionId, interface PermissionDefinition, variable PERMISSIONS_REGISTRY, variable ROUTE_PERMISSION_MAP
- **Imported by**: [middleware, lib/apiAuth, admin/layout, admin/page, admin/staff/page] (5 direct, 23 transitive)

### `src/lib/storage.ts` (lib)
- **Exports**: function uploadMedia, function uploadImage, function uploadMultipleImages, function deleteImage, function listImagesInFolder, function cleanBrokenMedia
- **Imported by**: [c/admin/MediaManager, rate/page, tracking/page, admin/repairs/page, admin/services/page] (5 direct, 15 transitive)
- **Imports**: [DATA_STORE::media_library, lib/firebase]

### `DATA_STORE::orders` (data_store)
- **Imported by**: [lib/useAdminBadges, lib/useCustomerActivity, admin/page, admin/orders/page, admin/revenue/page] (5 direct, 11 transitive)

### `DATA_STORE::appointments` (data_store)
- **Imported by**: [lib/useAdminBadges, c/home/BookingSection, admin/appointments/page, admin/repairs/page, c/admin/customers/CustomerDetailDrawer] (5 direct, 10 transitive)

### `src/lib/useFirestore.ts` (hook)
- **Exports**: function useFirestoreCollection, function useProducts, function useFlashSaleProducts, function useServices, function useArticles, function useOrders, function addDocument, function addDocumentWithId, function updateDocument, function deleteDocument, function subscribeNewsletter
- **Imported by**: [c/admin/UniversalProductModal, admin/parts/page, admin/products/page, admin/services/page, admin/settings/CategoriesTab] (5 direct, 7 transitive)
- **Imports**: [DATA_STORE::products, DATA_STORE::subscribers, lib/firebase]

### `src/components/admin/CategoryTaxonomySelector.tsx` (component)
- **Exports**: function default
- **Imported by**: [c/admin/UniversalProductModal, admin/parts/page, admin/products/page, admin/repairs/page, admin/services/page] (5 direct, 6 transitive)
- **Imports**: [lib/ConfigContext]

### `DATA_STORE::import_receipts` (data_store)
- **Imported by**: [c/admin/ExportImportReportButton, admin/inventory/page, admin/parts/page, admin/repairs/page, admin/revenue/page] (5 direct, 5 transitive)

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

### `src/lib/commissionCalcServer.ts` (lib)
- **Exports**: function getActiveRulesServer, function getCommissionRecipient, function calculateAndSaveCommissionsServer, function reverseCommissionServer
- **Imported by**: [api/orders/transition/route, api/pos/checkout/route, api/repairs/handover/route] (3 direct, 3 transitive)
- **Imports**: [DATA_STORE::==, lib/types]

### `DATA_STORE::commissions` (data_store)
- **Imported by**: [lib/commissionUtils, admin/commissions/page, admin/revenue/page] (3 direct, 3 transitive)

### `src/lib/icon-map.ts` (lib)
- **Exports**: function getIcon, variable ICON_MAP, variable ICON_NAMES
- **Imported by**: [c/home/HeroSection, c/layout/Header, admin/settings/NavigationTab] (3 direct, 9 transitive)

### `DATA_STORE::media_library` (data_store)
- **Imported by**: [lib/storage, c/admin/MediaManager, admin/articles/page] (3 direct, 16 transitive)

### `DATA_STORE::services` (data_store)
- **Imported by**: [c/admin/ExcelImportModal, c/home/ServiceBlock, admin/repairs/page] (3 direct, 4 transitive)

### `src/components/admin/UniversalProductModal.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/parts/page, admin/pos/page, admin/products/page] (3 direct, 3 transitive)
- **Imports**: [DATA_STORE::products, c/admin/CurrencyInput, lib/firebase, lib/utils, lib/useFirestore, lib/revalidate, lib/toast, c/admin/Modal, c/admin/MediaManager, c/admin/CategoryTaxonomySelector, lib/types, lib/constants]

### `DATA_STORE::articles` (data_store)
- **Imported by**: [c/home/ArticleBlock, admin/articles/page, tin-tuc/[slug]/ArticleClientParts] (3 direct, 6 transitive)

### `src/components/ui/Skeleton.tsx` (component)
- **Exports**: function Skeleton, function ProductCardSkeleton, function BannerSkeleton, function ServiceCardSkeleton, function BrandLogoSkeleton, function ArticleCardSkeleton, function TableRowSkeleton, function ChatMessageSkeleton
- **Imported by**: [c/home/ServiceBlock, c/ui/LazyImage, category/[...slug]/CategoryClient] (3 direct, 4 transitive)

### `src/lib/chatWorkflowHandoff.ts` (lib)
- **Exports**: function storeChatWorkflowHandoff, function consumeChatWorkflowHandoff, interface ChatWorkflowHandoff
- **Imported by**: [admin/pos/page, c/admin/chat/ChatCustomerProfileModal] (2 direct, 4 transitive)

### `DATA_STORE::commission_rules` (data_store)
- **Imported by**: [lib/commissionUtils, admin/commissions/page] (2 direct, 2 transitive)

### `DATA_STORE::disableImageProxy` (data_store)
- **Imported by**: [lib/ConfigContext, lib/imageLoader] (2 direct, 36 transitive)

### `DATA_STORE::customers` (data_store)
- **Imported by**: [lib/customerSync, admin/customers/page] (2 direct, 2 transitive)

### `src/lib/customerTiers.ts` (lib)
- **Exports**: function calculateCustomerTier, function getTierDiscountPercent, type CustomerTier, interface TierConfig, variable TIER_CONFIGS
- **Imported by**: [admin/customers/page, admin/settings/discount-rules/page] (2 direct, 2 transitive)

### `DATA_STORE::accessory_discount_rules` (data_store)
- **Imported by**: [lib/discountRuleUtils, admin/settings/discount-rules/page] (2 direct, 3 transitive)

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
- **Imports**: [lib/firebase, lib/chatChannels]

### `ENV::REVALIDATE_SECRET` (env)
- **Imported by**: [lib/revalidate, api/revalidate/route] (2 direct, 38 transitive)

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

### `src/lib/useCustomerActivity.ts` (hook)
- **Exports**: function normalizeCustomerPhone, function isOpenOrderStatus, function useCustomerActivity, interface CustomerOrderActivity, interface CustomerRepairActivity
- **Imported by**: [c/admin/chat/ChatCustomerActivityPanel, c/admin/customers/CustomerDetailDrawer] (2 direct, 4 transitive)
- **Imports**: [DATA_STORE::orders, DATA_STORE::repairs, DATA_STORE::system_config, lib/firebase, lib/types]

### `DATA_STORE::inventory_logs` (data_store)
- **Imported by**: [c/admin/ExcelImportModal, admin/inventory/page] (2 direct, 3 transitive)

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
- **Imports**: [lib/ConfigContext, lib/CartContext, lib/icon-map]

### `src/components/layout/MobileBottomNav.tsx` (component)
- **Exports**: function default
- **Imported by**: [not-found, layout.shell] (2 direct, 3 transitive)
- **Imports**: [lib/AuthContext, lib/ConfigContext]

### `DATA_STORE::article_comments` (data_store)
- **Imported by**: [admin/articles/page, tin-tuc/[slug]/ArticleClientParts] (2 direct, 3 transitive)

### `DATA_STORE::suppliers` (data_store)
- **Imported by**: [admin/parts/page, admin/suppliers/page] (2 direct, 2 transitive)

### `src/components/admin/chat/ChatCustomerProfileModal.tsx` (component)
- **Exports**: function default, interface ChatProfileRoom
- **Imported by**: [admin/chat/page, c/admin/chat/ChatCustomerActivityPanel] (2 direct, 2 transitive)
- **Imports**: [c/admin/Modal, lib/firebase, lib/AuthContext, lib/chatWorkflowHandoff, lib/toast, lib/chatChannels]

### `src/components/CartDrawer.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/CartContext]

### `src/components/ChatWidget.tsx` (component)
- **Exports**: function default
- **Imported by**: [layout.shell] (1 direct, 2 transitive)
- **Imports**: [lib/realtimedb, lib/AuthContext, lib/ConfigContext, lib/firebase]

### `DATA_STORE::has_logged_in` (data_store)
- **Imported by**: [lib/AuthContext] (1 direct, 29 transitive)

### `ENV::FACEBOOK_PAGE_ACCESS_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::META_PAGE_ACCESS_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::FACEBOOK_APP_SECRET` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::META_APP_SECRET` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::FACEBOOK_WEBHOOK_VERIFY_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::META_WEBHOOK_VERIFY_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::ZALO_OA_ACCESS_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::ZALO_WEBHOOK_SECRET` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::ZALO_WEBHOOK_TOKEN` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::FACEBOOK_PAGE_ID` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::META_PAGE_ID` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::FACEBOOK_GRAPH_VERSION` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::META_GRAPH_VERSION` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::ZALO_OA_ID` (env)
- **Imported by**: [lib/chatIntegrationConfig] (1 direct, 10 transitive)

### `ENV::NEXT_PUBLIC_SITE_URL` (env)
- **Imported by**: [lib/constants] (1 direct, 37 transitive)

### `src/lib/discountCalc.ts` (lib)
- **Exports**: function matchesKeywords, function calculateAccessoryDiscounts, interface DiscountCalculationResult
- **Imported by**: [lib/discountRuleUtils] (1 direct, 2 transitive)
- **Imports**: [lib/types]

### `src/lib/discountRuleUtils.ts` (lib)
- **Exports**: function fetchActiveDiscountRules, function calculateAccessoryDiscounts, function matchesKeywords, interface DiscountCalculationResult
- **Imported by**: [admin/pos/page] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::accessory_discount_rules, lib/firebase, lib/types, lib/discountCalc]

### `ENV::NEXT_PUBLIC_FIREBASE_API_KEY` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_PROJECT_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_APP_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

### `ENV::NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (env)
- **Imported by**: [lib/firebase] (1 direct, 82 transitive)

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
- **Imports**: [DATA_STORE::==, page.client, lib/firebaseAdmin, lib/config-defaults]

### `DATA_STORE::analytics` (data_store)
- **Imported by**: [admin/page] (1 direct, 1 transitive)

### `src/components/admin/ExcelImportModal.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/products/page] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::products, DATA_STORE::inventory_logs, DATA_STORE::services, lib/firebase, lib/AuthContext, lib/ConfigContext, lib/types]

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

### `src/app/(customer)/dao-tao-hoc-vien/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [dao-tao-hoc-vien/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, lib/constants]

### `src/app/(customer)/flash-sale/page.client.tsx` (other)
- **Exports**: function default
- **Imported by**: [flash-sale/page] (1 direct, 1 transitive)

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
- **Imports**: [lib/useFirestore, lib/types, lib/ConfigContext, c/admin/Modal, c/admin/MediaManager, lib/utils, lib/toast, lib/revalidate]

### `src/app/admin/settings/NavigationTab.tsx` (other)
- **Exports**: function default
- **Imported by**: [admin/settings/page] (1 direct, 1 transitive)
- **Imports**: [lib/ConfigContext, lib/config-defaults, lib/types, lib/icon-map, lib/utils, lib/revalidate, c/admin/MediaManager]

### `DATA_STORE::supplier_transactions` (data_store)
- **Imported by**: [admin/suppliers/page] (1 direct, 1 transitive)

### `ENV::ADMIN_SEED_SECRET` (env)
- **Imported by**: [api/seed-admin/route] (1 direct, 1 transitive)

### `src/components/admin/chat/ChatCustomerActivityPanel.tsx` (component)
- **Exports**: function default
- **Imported by**: [admin/chat/page] (1 direct, 1 transitive)
- **Imports**: [lib/useCustomerActivity, c/admin/chat/ChatCustomerProfileModal]

### `src/components/admin/customers/CustomerDetailDrawer.tsx` (component)
- **Exports**: function default, interface CustomerDetailRecord
- **Imported by**: [admin/customers/page] (1 direct, 1 transitive)
- **Imports**: [DATA_STORE::appointments, lib/AuthContext, lib/useCustomerActivity, lib/firebase]

### `src/components/admin/customers/CustomerFormModal.tsx` (component)
- **Exports**: function default, interface CustomerFormData
- **Imported by**: [admin/customers/page] (1 direct, 1 transitive)

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
- **Imports**: [DATA_STORE::articles, DATA_STORE::article_comments, lib/firebase, lib/types]

### `DATA_STORE:: ` (data_store)
- **Imported by**: [tin-tuc/[slug]/layout] (1 direct, 1 transitive)

### `eslint.config.mjs` (config)
- **Exports**: variable default

### `next.config.mjs` (config)
- **Exports**: variable default

### `postcss.config.mjs` (config)
- **Exports**: variable default

### `src/middleware.ts` (other)
- **Exports**: function middleware, variable config
- **Imports**: [lib/sessionCookie, lib/permissions]

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
- **Imports**: [DATA_STORE::==, lib/firebaseAdmin, lib/constants, _lib/server-queries]

### `src/components/AuthModal.tsx` (component)
- **Exports**: function default
- **Imports**: [lib/AuthContext]

### `src/lib/commissionUtils.ts` (lib)
- **Exports**: function getActiveRules, function calculateAndSaveCommissions
- **Imports**: [DATA_STORE::commission_rules, DATA_STORE::products, DATA_STORE::commissions, lib/firebase, lib/types]

### `src/lib/customerSync.ts` (lib)
- **Exports**: function ensureCustomerProfile, interface CustomerSyncData
- **Imports**: [DATA_STORE::customers]

### `src/app/(customer)/layout.tsx` (layout)
- **Exports**: function default, variable revalidate
- **Imports**: [lib/firebaseAdmin, lib/ConfigContext, lib/config-defaults, layout.shell]

### `src/app/admin/layout.tsx` (layout)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, lib/permissions, lib/AuthContext, c/admin/NotificationBell, lib/toast, lib/useAdminBadges]

### `src/app/admin/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, DATA_STORE::repairs, DATA_STORE::analytics, lib/AuthContext, lib/permissions, lib/firebase, lib/types]

### `src/components/admin/ExportImportReportButton.tsx` (component)
- **Exports**: function default
- **Imports**: [DATA_STORE::import_receipts, lib/firebase]

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
- **Imports**: [DATA_STORE::==, lib/firebaseAdmin, reviews/ReviewsClient]

### `src/app/(customer)/search/page.tsx` (page)
- **Exports**: function default
- **Imports**: [c/home/ServiceCard, lib/constants]

### `src/app/(customer)/tin-tuc/page.tsx` (page)
- **Exports**: function default, variable revalidate
- **Imports**: [tin-tuc/page.client, _lib/server-queries]

### `src/app/(customer)/tracking/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, lib/firebase, lib/ConfigContext, lib/storage, lib/types, lib/workflowFeatures, lib/constants]

### `src/app/admin/ai-creator/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase]

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
- **Imports**: [lib/realtimedb, lib/firebase, lib/chatChannels, lib/toast, lib/AuthContext, c/admin/chat/ChatCustomerProfileModal, c/admin/chat/ChatCustomerActivityPanel]

### `src/app/admin/commissions/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::commission_rules, DATA_STORE::commissions, DATA_STORE::users, c/admin/Modal, c/admin/CurrencyInput, lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/customers/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, DATA_STORE::customers, lib/useClientPagination, c/admin/PaginationBar, lib/firebase, c/admin/customers/CustomerDetailDrawer, c/admin/customers/CustomerFormModal, lib/customerTiers]

### `src/app/admin/inventory/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::import_receipts, DATA_STORE::products, DATA_STORE::inventory_logs, lib/firebase, lib/AuthContext, lib/types, lib/toast]

### `src/app/admin/login/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::users, lib/firebase, lib/AuthContext, lib/ConfigContext]

### `src/app/admin/orders/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal, lib/firebase, lib/types, lib/AuthContext, lib/ConfigContext, lib/toast]

### `src/app/admin/parts/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::suppliers, DATA_STORE::system_config, DATA_STORE::import_receipts, DATA_STORE::products, lib/useFirestore, lib/constants, c/admin/CategoryTaxonomySelector, c/admin/Modal, c/admin/UniversalProductModal, lib/types, lib/firebase, lib/AuthContext, lib/toast, lib/useClientPagination, c/admin/PaginationBar, c/admin/CurrencyInput]

### `src/app/admin/pos/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::repairs, DATA_STORE::products, lib/AuthContext, lib/ConfigContext, c/admin/Modal, c/admin/UniversalProductModal, lib/firebase, lib/types, lib/toast, lib/config-defaults, lib/constants, lib/discountRuleUtils, c/admin/CurrencyInput, lib/chatWorkflowHandoff]

### `src/app/admin/products/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/UniversalProductModal, c/admin/CategoryTaxonomySelector, c/admin/ExcelImportModal, lib/types, lib/ConfigContext, lib/utils, lib/constants]

### `src/app/admin/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::import_receipts, DATA_STORE::repairs, DATA_STORE::system_config, DATA_STORE::users, DATA_STORE::products, DATA_STORE::services, DATA_STORE::appointments, lib/firebase, lib/AuthContext, lib/ConfigContext, lib/types, lib/constants, lib/storage, lib/workflowFeatures, c/admin/PrintableReceipt, c/admin/PrintableRepairInvoice, lib/toast, lib/warrantyUtils, lib/useClientPagination, c/admin/PaginationBar, c/admin/Modal, c/admin/CategoryTaxonomySelector, c/admin/MediaManager, c/admin/CurrencyInput]

### `src/app/admin/revenue/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::orders, DATA_STORE::repairs, DATA_STORE::import_receipts, DATA_STORE::commissions, DATA_STORE::expenses, c/admin/Modal, c/admin/CurrencyInput, lib/firebase, lib/AuthContext, lib/types]

### `src/app/admin/reviews/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::reviews, lib/firebase, lib/AuthContext, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/services/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/useFirestore, lib/storage, lib/utils, lib/types, lib/toast, lib/useClientPagination, c/admin/PaginationBar, lib/revalidate, c/admin/Modal, c/admin/MediaManager, c/admin/CategoryTaxonomySelector, c/admin/CurrencyInput, lib/ConfigContext]

### `src/app/admin/settings/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/ConfigContext, lib/firebase, admin/settings/CategoriesTab, admin/settings/NavigationTab]

### `src/app/admin/staff/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::users, c/admin/Modal, lib/firebase, lib/AuthContext, lib/toast, lib/permissions]

### `src/app/admin/suppliers/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::suppliers, DATA_STORE::supplier_transactions, lib/firebase, lib/AuthContext, c/admin/CurrencyInput, lib/types]

### `src/app/admin/technician/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::products, DATA_STORE::repairs, DATA_STORE::system_config, lib/firebase, lib/AuthContext, lib/workflowFeatures, lib/types, lib/toast, lib/constants, c/admin/Modal]

### `src/app/api/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::products, lib/gemini, lib/firebase, lib/rateLimit]

### `src/app/api/appointments/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/rateLimit]

### `src/app/api/checkout/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/rateLimit]

### `src/app/api/products/route.ts` (api)
- **Exports**: function GET
- **Imports**: [DATA_STORE::products, lib/firebase]

### `src/app/api/revalidate/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [ENV::REVALIDATE_SECRET]

### `src/app/api/reviews/route.ts` (api)
- **Exports**: function GET, function POST
- **Imports**: [DATA_STORE::system_config, DATA_STORE::reviews, lib/firebase, lib/rateLimit]

### `src/app/api/search/route.ts` (api)
- **Exports**: function GET
- **Imports**: [DATA_STORE::==, lib/firebaseAdmin, lib/rateLimit]

### `src/app/api/seed-admin/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [DATA_STORE::users, ENV::NODE_ENV, ENV::ADMIN_SEED_SECRET, lib/firebase]

### `src/app/api/seed-config/route.ts` (api)
- **Exports**: function POST, function GET
- **Imports**: [DATA_STORE::system_config, lib/firebase, lib/ConfigContext, lib/apiAuth]

### `src/app/api/tracking/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::==, lib/firebaseAdmin]

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

### `src/app/(customer)/info/dieu-khoan-dich-vu/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/gioi-thieu/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/tra-gop/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/info/xoa-du-lieu-nguoi-dung/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/constants]

### `src/app/(customer)/product/[id]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, lib/firebaseAdmin]

### `src/app/(customer)/product/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, lib/sanitizeHtml, _lib/server-queries, product/[id]/ProductDetailClient]

### `src/app/(customer)/service/[id]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/service/[id]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [lib/constants, _lib/server-queries, service/[id]/ServiceDetailClient]

### `src/app/(customer)/tin-tuc/[slug]/layout.tsx` (layout)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [DATA_STORE:: , lib/firebaseAdmin, lib/constants]

### `src/app/(customer)/tin-tuc/[slug]/page.tsx` (page)
- **Exports**: function generateMetadata, function default, variable revalidate
- **Imports**: [c/VideoEmbed, lib/constants, lib/sanitizeHtml, tin-tuc/[slug]/ArticleClientParts, _lib/server-queries]

### `src/app/admin/inventory/stock/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::products, lib/firebase, lib/types, lib/useClientPagination, c/admin/PaginationBar]

### `src/app/admin/settings/discount-rules/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::accessory_discount_rules, DATA_STORE::system_config, lib/firebase, lib/types, lib/customerTiers]

### `src/app/admin/settings/integrations/page.tsx` (page)
- **Exports**: function default
- **Imports**: [lib/firebase]

### `src/app/admin/settings/receipt/page.tsx` (page)
- **Exports**: function default, interface ReceiptConfig
- **Imports**: [DATA_STORE::system_config, lib/firebase, c/admin/MediaManager, lib/toast]

### `src/app/admin/settings/repairs/page.tsx` (page)
- **Exports**: function default
- **Imports**: [DATA_STORE::system_config, c/admin/Modal, lib/firebase, lib/workflowFeatures, lib/types, lib/toast]

### `src/app/api/admin/ai/route.ts` (api)
- **Exports**: function POST
- **Imports**: [ENV::OLLAMA_HOST, ENV::OLLAMA_MODEL, lib/ollama, lib/apiAuth, lib/rateLimit]

### `src/app/api/admin/seed-taxonomy/route.ts` (api)
- **Exports**: function POST
- **Imports**: [ENV::NODE_ENV, lib/firebaseAdmin, lib/config-defaults, lib/apiAuth]

### `src/app/api/analytics/visit/route.ts` (api)
- **Exports**: function POST
- **Imports**: [ENV::NODE_ENV, lib/firebaseAdmin, lib/rateLimit]

### `src/app/api/auth/session/route.ts` (api)
- **Exports**: function POST, function DELETE
- **Imports**: [ENV::NODE_ENV, lib/firebaseAdmin, lib/sessionCookie]

### `src/app/api/inventory/import/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types]

### `src/app/api/orders/assign-seller/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types]

### `src/app/api/orders/transition/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types, lib/commissionCalcServer]

### `src/app/api/pos/checkout/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/commissionCalcServer, lib/types]

### `src/app/api/repairs/confirm-parts/route.ts` (api)
- **Exports**: function POST
- **Imports**: [DATA_STORE::==, lib/firebaseAdmin, lib/apiAuth, lib/types]

### `src/app/api/repairs/handover/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types, lib/commissionCalcServer]

### `src/app/api/repairs/payment-edit/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types]

### `src/app/api/repairs/transition/route.ts` (api)
- **Exports**: function POST
- **Imports**: [lib/firebaseAdmin, lib/apiAuth, lib/types]

### `src/app/api/admin/chat/integrations/route.ts` (api)
- **Exports**: function GET, function PUT, function POST, variable runtime
- **Imports**: [lib/apiAuth, lib/chatIntegrationConfig, lib/firebaseAdmin]

### `src/app/api/admin/chat/quick-replies/route.ts` (api)
- **Exports**: function GET, variable runtime
- **Imports**: [lib/apiAuth, lib/chatIntegrationConfig]

### `src/app/api/admin/chat/send/route.ts` (api)
- **Exports**: function POST, variable runtime
- **Imports**: [lib/apiAuth, lib/chatServer]

### `src/app/api/integrations/facebook/webhook/route.ts` (api)
- **Exports**: function GET, function POST, variable runtime
- **Imports**: [ENV::NODE_ENV, lib/chatServer, lib/chatIntegrationConfig]

### `src/app/api/integrations/zalo/webhook/route.ts` (api)
- **Exports**: function GET, function POST, variable runtime
- **Imports**: [ENV::NODE_ENV, lib/chatServer, lib/chatIntegrationConfig]

### `src/app/api/integrations/facebook/webhook/test/route.ts` (api)
- **Exports**: function POST, function GET, variable runtime
- **Imports**: [lib/chatServer, lib/chatIntegrationConfig, lib/apiAuth]

### `src/app/api/admin/chat/rooms/[roomId]/customer/route.ts` (api)
- **Exports**: function GET, function POST, variable runtime
- **Imports**: [lib/apiAuth, lib/chatChannels, lib/firebaseAdmin]

### `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts` (api)
- **Exports**: function POST, variable runtime
- **Imports**: [lib/apiAuth, lib/chatServer]

### `src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts` (api)
- **Exports**: function GET, variable runtime
- **Imports**: [lib/apiAuth, lib/chatServer, lib/chatChannels, lib/firebaseAdmin]

