'use client';

import { Clock, Facebook, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { getBusinessIdentity } from '@/lib/businessIdentity';

export default function ContactPage() {
    const { config } = useConfig();
    const identity = getBusinessIdentity(config);
    const branches = config.store_branches || [];

    return (
        <main className="min-h-screen bg-gray-50 py-6 md:py-10">
            <section className="max-w-[1200px] mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Liên hệ {identity.siteName}</h1>
                    <p className="mt-2 text-gray-600">Chọn kênh thuận tiện hoặc đến cửa hàng gần nhất để được hỗ trợ.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-10">
                    <a href={`tel:${identity.mainPhone}`} className="min-h-24 rounded-lg bg-white border border-gray-200 p-4 flex flex-col justify-center gap-2 text-gray-800 hover:border-orange-400">
                        <Phone className="text-orange-500" size={22} />
                        <span className="font-semibold">Gọi hotline</span>
                        <span className="text-sm text-gray-500">{identity.formattedPhone}</span>
                    </a>
                    <a href={identity.socials.zaloLink} target="_blank" rel="noreferrer" className="min-h-24 rounded-lg bg-white border border-gray-200 p-4 flex flex-col justify-center gap-2 text-gray-800 hover:border-blue-400">
                        <MessageCircle className="text-blue-600" size={22} />
                        <span className="font-semibold">Chat Zalo</span>
                    </a>
                    <a href={identity.socials.facebookLink} target="_blank" rel="noreferrer" className="min-h-24 rounded-lg bg-white border border-gray-200 p-4 flex flex-col justify-center gap-2 text-gray-800 hover:border-blue-500">
                        <Facebook className="text-blue-700" size={22} />
                        <span className="font-semibold">Facebook</span>
                    </a>
                    <div className="min-h-24 rounded-lg bg-white border border-gray-200 p-4 flex flex-col justify-center gap-2 text-gray-800">
                        <Clock className="text-emerald-600" size={22} />
                        <span className="font-semibold">Giờ làm việc</span>
                        <span className="text-sm text-gray-500">07:30 - 21:00 mỗi ngày</span>
                    </div>
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-4">Hệ thống cửa hàng</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {branches.map(branch => (
                        <article key={branch.id} className="rounded-lg bg-white border border-gray-200 p-5">
                            <h3 className="font-bold text-gray-900">{branch.name}</h3>
                            <p className="mt-2 flex items-start gap-2 text-sm text-gray-600"><MapPin size={17} className="mt-0.5 shrink-0 text-orange-500" />{branch.address}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <a href={`tel:${branch.phone}`} className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"><Phone size={16} />Gọi cửa hàng</a>
                                <a href={branch.mapLink || identity.mapLink} target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"><MapPin size={16} />Chỉ đường</a>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}
