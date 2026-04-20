import Link from 'next/link';
import { Metadata } from 'next';
import { Home, Search, PackageSearch, Smartphone, Laptop, Newspaper } from 'lucide-react';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import { CartProvider } from "@/lib/CartContext";
import { ServerConfigProvider, DEFAULT_CONFIG } from "@/lib/ConfigContext";

export const metadata: Metadata = {
  title: '404 - Không tìm thấy trang | Văn Lành Service',
  description: 'Rất tiếc, trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ. Vui lòng quay lại trang chủ.',
  robots: {
    index: false,
    follow: true,
  }
};

export default function NotFound() {
  return (
    <ServerConfigProvider initialConfig={DEFAULT_CONFIG}>
    <CartProvider>
      <div className="flex flex-col min-h-screen w-full">
        <Header />
        
        <main className="flex-1 flex flex-col items-center justify-center bg-gray-50 px-4 py-20">
          <div className="text-center max-w-3xl mx-auto w-full">
            {/* Visual 404 Section */}
            <div className="relative mb-10 w-full flex justify-center items-center">
               <h1 className="text-[12rem] font-black leading-none text-transparent bg-clip-text bg-gradient-to-br from-copper/20 via-orange-500/10 to-transparent select-none">
                 404
               </h1>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <div className="w-20 h-20 bg-copper/10 rounded-full flex items-center justify-center mb-4">
                    <Search className="text-copper w-10 h-10" />
                 </div>
                 <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Ối! Lạc đường rồi 😥</h2>
               </div>
            </div>
            
            <p className="text-lg text-gray-600 mb-10 max-w-xl mx-auto">
              Rất tiếc, đường dẫn bạn đang tìm kiếm không tồn tại, có thể đã bị thay đổi hoặc đã bị gỡ bỏ. Đừng lo lắng, hãy để chúng tôi đưa bạn về đúng hướng.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/" 
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 bg-copper text-white rounded-xl font-semibold hover:bg-copper-dark transition-all duration-300 hover:shadow-lg hover:shadow-copper/30 hover:-translate-y-0.5"
              >
                <Home size={20} />
                Trở Về Trang Chủ
              </Link>
              <Link 
                href="/tracking"
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 bg-white text-gray-700 border border-gray-200 rounded-xl font-semibold hover:border-copper hover:text-copper transition-all duration-300 shadow-sm hover:shadow-md"
              >
                <PackageSearch size={20} />
                Tra Cứu Đơn Hàng
              </Link>
            </div>

            {/* Quick Suggestions */}
            <div className="mt-16 pt-8 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-5 uppercase tracking-wider">Hoặc khám phá các dịch vụ nổi bật</p>
                <div className="flex flex-wrap justify-center gap-3">
                   <Link href="/category/dien-thoai" className="flex items-center gap-2 text-sm px-5 py-2.5 bg-white border border-gray-200 rounded-full hover:border-copper hover:text-copper transition-colors shadow-sm">
                     <Smartphone size={16} /> Điện thoại
                   </Link>
                   <Link href="/category/laptop" className="flex items-center gap-2 text-sm px-5 py-2.5 bg-white border border-gray-200 rounded-full hover:border-copper hover:text-copper transition-colors shadow-sm">
                     <Laptop size={16} /> Laptop
                   </Link>
                   <Link href="/search" className="flex items-center gap-2 text-sm px-5 py-2.5 bg-white border border-gray-200 rounded-full hover:border-copper hover:text-copper transition-colors shadow-sm">
                     <Search size={16} /> Tìm kiếm sản phẩm
                   </Link>
                   <Link href="/tin-tuc" className="flex items-center gap-2 text-sm px-5 py-2.5 bg-white border border-gray-200 rounded-full hover:border-copper hover:text-copper transition-colors shadow-sm">
                     <Newspaper size={16} /> Tin tức công nghệ
                   </Link>
                </div>
            </div>
          </div>
        </main>

        <Footer />
        <MobileBottomNav />
      </div>
    </CartProvider>
    </ServerConfigProvider>
  );
}
