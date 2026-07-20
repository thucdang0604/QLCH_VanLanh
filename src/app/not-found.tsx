import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowRight, Home, PackageSearch, Phone, Search } from 'lucide-react';
import CustomerLayoutShell from '@/app/(customer)/layout.shell';
import MissionsWidget from '@/components/MissionsWidget';
import { ServerConfigProvider } from '@/lib/ConfigContext';
import { getBusinessIdentity } from '@/lib/businessIdentity';
import type { FooterServiceLink, HomeServiceCategory, NavItem, SiteConfig } from '@/lib/config-defaults';
import { getCachedStorefrontConfig } from '@/lib/serverConfig';

export const revalidate = 300;

type SuggestedLink = {
  id: string;
  label: string;
  href: string;
  meta?: string;
  marker?: string;
};

type ConfiguredLink =
  | Pick<NavItem, 'id' | 'label' | 'slug' | 'isCustomLink'>
  | Pick<FooterServiceLink, 'id' | 'name' | 'slug' | 'isCustomLink'>
  | Pick<HomeServiceCategory, 'id' | 'name' | 'slug' | 'isCustomLink' | 'count' | 'icon'>;

function resolveHref(item: ConfiguredLink) {
  const slug = item.slug?.trim();
  if (!slug) return null;
  if (item.isCustomLink) return slug;
  return `/category/${slug.replace(/^\/+/, '')}`;
}

function uniqueByHref(items: SuggestedLink[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function isSuggestedLink(item: SuggestedLink | null): item is SuggestedLink {
  return item !== null;
}

function isImageMarker(value: string | undefined) {
  return Boolean(value && (value.startsWith('http') || value.startsWith('/')));
}

function buildSuggestions(config: SiteConfig): SuggestedLink[] {
  const homeCategories: SuggestedLink[] = (config.homeServiceCategories || [])
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)
    .map<SuggestedLink | null>((item) => {
      const href = resolveHref(item);
      if (!href) return null;
      return {
        id: `home-${item.id}`,
        label: item.name,
        href,
        meta: item.count,
        marker: item.icon,
      };
    })
    .filter(isSuggestedLink);

  const headerLinks: SuggestedLink[] = (config.headerNav || [])
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)
    .map<SuggestedLink | null>((item) => {
      const href = resolveHref(item);
      if (!href) return null;
      return {
        id: `nav-${item.id}`,
        label: item.label,
        href,
      };
    })
    .filter(isSuggestedLink);

  const footerServices: SuggestedLink[] = (config.footerServices || [])
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)
    .map<SuggestedLink | null>((item) => {
      const href = resolveHref(item);
      if (!href) return null;
      return {
        id: `footer-${item.id}`,
        label: item.name,
        href,
      };
    })
    .filter(isSuggestedLink);

  return uniqueByHref([...homeCategories, ...headerLinks, ...footerServices]).slice(0, 6);
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getCachedStorefrontConfig();
  const identity = getBusinessIdentity(config);

  return {
    title: `Không tìm thấy trang | ${identity.siteName}`,
    description: `Trang bạn đang tìm không tồn tại hoặc đã được di chuyển. Quay lại ${identity.siteName} để tiếp tục tìm sản phẩm, dịch vụ hoặc tra cứu đơn hàng.`,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function NotFound() {
  const config = await getCachedStorefrontConfig();
  const identity = getBusinessIdentity(config);
  const suggestions = buildSuggestions(config);

  return (
    <ServerConfigProvider initialConfig={config}>
      <CustomerLayoutShell>
        <section className="min-h-[calc(100vh-12rem)] bg-gray-50 px-4 py-10 sm:py-14">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-copper/10 text-copper">
              <Search size={30} aria-hidden="true" />
            </div>

            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-copper">404</p>
            <h1 className="max-w-3xl text-3xl font-extrabold leading-tight text-gray-950 sm:text-5xl">
              Trang này không còn khả dụng
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
              Đường dẫn có thể đã đổi hoặc nội dung đã được gỡ khỏi hệ thống của {identity.siteName}. Bạn có thể quay về trang chủ, tra cứu đơn hàng hoặc mở nhanh một nhóm dịch vụ đang được cấu hình trên website.
            </p>

            <div className="mt-8 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-copper px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-copper-dark focus:outline-none focus:ring-2 focus:ring-copper/40"
              >
                <Home size={18} aria-hidden="true" />
                Về trang chủ
              </Link>
              <Link
                href="/tracking"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-copper hover:text-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
              >
                <PackageSearch size={18} aria-hidden="true" />
                Tra cứu đơn hàng
              </Link>
              <a
                href={`tel:${identity.mainPhone}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-copper hover:text-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
              >
                <Phone size={18} aria-hidden="true" />
                {identity.formattedPhone}
              </a>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-12 w-full text-left">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Gợi ý từ cấu hình website</p>
                    <h2 className="mt-1 text-xl font-bold text-gray-950">Mở nhanh danh mục đang hiển thị</h2>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group flex min-h-24 items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-copper hover:shadow-md"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {isImageMarker(item.marker) ? (
                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100" aria-hidden="true">
                            <Image
                              src={item.marker || ''}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-contain p-1"
                            />
                          </span>
                        ) : item.marker ? (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg" aria-hidden="true">
                            {item.marker}
                          </span>
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper/10 text-copper" aria-hidden="true">
                            <Search size={18} />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-gray-900 group-hover:text-copper">{item.label}</span>
                          {item.meta && <span className="mt-1 block text-xs text-gray-500">{item.meta}</span>}
                        </span>
                      </span>
                      <ArrowRight size={17} className="shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-copper" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </CustomerLayoutShell>
      <MissionsWidget />
    </ServerConfigProvider>
  );
}
