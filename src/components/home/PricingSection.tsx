'use client';

import { useState } from 'react';
import { Smartphone, Tablet, Laptop, Watch, ChevronRight } from 'lucide-react';

const categories = [
    { id: 'iphone', label: 'iPhone', icon: Smartphone },
    { id: 'ipad', label: 'iPad', icon: Tablet },
    { id: 'macbook', label: 'MacBook', icon: Laptop },
    { id: 'watch', label: 'Apple Watch', icon: Watch },
];

const mockPricing = {
    iphone: [
        { name: 'Thay Pin iPhone 13 Pro Max', price: '850.000đ', oldPrice: '1.200.000đ', badge: 'Hot' },
        { name: 'Thay Màn hình iPhone 12', price: '1.500.000đ', oldPrice: '2.000.000đ' },
        { name: 'Thay Kính lưng iPhone 14 Pro', price: '1.200.000đ', oldPrice: '1.500.000đ' },
        { name: 'Sửa Face ID iPhone 11', price: '600.000đ', oldPrice: '800.000đ' },
    ],
    ipad: [
        { name: 'Thay Pin iPad Pro 11 inch', price: '1.200.000đ', oldPrice: '1.500.000đ' },
        { name: 'Thay Kính cảm ứng iPad Air 4', price: '900.000đ', oldPrice: '1.200.000đ' },
        { name: 'Sửa chân sạc iPad Gen 9', price: '450.000đ', oldPrice: '600.000đ' },
    ],
    macbook: [
        { name: 'Vệ sinh bảo dưỡng MacBook', price: '250.000đ', oldPrice: '350.000đ', badge: 'Best' },
        { name: 'Thay Pin MacBook Air M1', price: '2.500.000đ', oldPrice: '3.000.000đ' },
        { name: 'Thay Bàn phím MacBook Pro', price: '1.800.000đ', oldPrice: '2.200.000đ' },
    ],
    watch: [
        { name: 'Thay Pin Apple Watch Series 6', price: '500.000đ', oldPrice: '700.000đ' },
        { name: 'Thay Mặt kính Series 7', price: '800.000đ', oldPrice: '1.000.000đ' },
    ]
};

export default function PricingSection() {
    const [activeTab, setActiveTab] = useState('iphone');

    const currentServices = mockPricing[activeTab as keyof typeof mockPricing] || [];

    return (
        <section className="py-12 bg-gray-50 border-t border-b border-gray-100">
            <div className="max-w-[1200px] mx-auto px-4 md:px-6">
                <div className="text-center mb-10">
                    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                        Bảng Giá <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">Sửa Chữa</span>
                    </h2>
                    <p className="text-gray-500 mt-2">Minh bạch, rõ ràng, linh kiện chính hãng</p>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto hide-scrollbar gap-2 md:justify-center mb-8 pb-2 snap-x">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = activeTab === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`snap-center flex items-center gap-2 px-5 py-3 rounded-full font-semibold transition-all whitespace-nowrap border-2 ${
                                    isActive 
                                    ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-sm shadow-orange-500/20' 
                                    : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                                <Icon size={18} className={isActive ? 'text-orange-500' : 'text-gray-400'} />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentServices.map((service, index) => (
                        <div 
                            key={index}
                            className="group bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex justify-between items-center relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-50 to-red-50 rounded-bl-full -z-10 transition-transform group-hover:scale-150" />
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-gray-800">{service.name}</h3>
                                    {service.badge && (
                                        <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                            {service.badge}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className="text-lg font-extrabold text-orange-600">{service.price}</span>
                                    {service.oldPrice && (
                                        <span className="text-xs font-semibold text-gray-400 line-through mb-1">{service.oldPrice}</span>
                                    )}
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-orange-500 group-hover:text-white flex items-center justify-center text-gray-400 transition-colors">
                                <ChevronRight size={18} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex justify-center">
                    <button className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:text-orange-600 transition-colors flex items-center gap-2 shadow-sm">
                        Xem tất cả bảng giá <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </section>
    );
}
