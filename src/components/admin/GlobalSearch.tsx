'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, QrCode, X, Loader2, Package, Sparkles, ShoppingCart, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { toastError } from '@/lib/toast';

interface SearchResult {
    id: string;
    _type: 'product' | 'service' | 'order' | 'repair' | 'unknown';
    name?: string;
    title?: string;
    category?: string;
    brand?: string;
    customer?: { name?: string; phone?: string };
}

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReader = useRef<BrowserMultiFormatReader | null>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const router = useRouter();

    const searchWrapperRef = useRef<HTMLDivElement>(null);

    // Initialize code reader
    useEffect(() => {
        codeReader.current = new BrowserMultiFormatReader();
        return () => {
            codeReader.current = null;
        };
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const performSearch = useCallback(async (q: string) => {
        if (!q.trim()) {
            setResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
                setShowResults(true);
            }
        } catch (error) {
            console.error('Search error', error);
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (query) {
                performSearch(query);
            } else {
                setResults([]);
                setShowResults(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [query, performSearch]);

    // QR Scanner
    useEffect(() => {
        if (showScanner) {
            navigator.mediaDevices.enumerateDevices()
                .then((mediaInputDevices) => {
                    const videoInputDevices = mediaInputDevices.filter(d => d.kind === 'videoinput');
                    setDevices(videoInputDevices);
                    if (videoInputDevices.length > 0) {
                        // Prefer back camera
                        const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back'));
                        setSelectedDevice(backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId);
                    } else {
                        toastError('Không tìm thấy camera trên thiết bị này');
                        setShowScanner(false);
                    }
                })
                .catch((err) => {
                    console.error(err);
                    toastError('Lỗi truy cập camera');
                });
        } else {
            if (controlsRef.current) {
                controlsRef.current.stop();
                controlsRef.current = null;
            }
        }
        
        return () => {
            if (controlsRef.current) {
                controlsRef.current.stop();
            }
        };
    }, [showScanner]);

    useEffect(() => {
        if (showScanner && selectedDevice && videoRef.current && codeReader.current) {
            if (controlsRef.current) {
                controlsRef.current.stop();
            }
            codeReader.current.decodeFromVideoDevice(selectedDevice, videoRef.current, (result, err, controls) => {
                controlsRef.current = controls;
                if (result) {
                    const text = result.getText();
                    setQuery(text);
                    setShowScanner(false);
                    controls?.stop();
                    // trigger search immediately
                    performSearch(text);
                }
            }).catch(console.error);
        }
    }, [showScanner, selectedDevice, performSearch]);

    const handleResultClick = (item: SearchResult) => {
        setShowResults(false);
        setQuery('');
        switch(item._type) {
            case 'product':
            case 'service':
                router.push(`/admin/pos?search=${encodeURIComponent(item.name || item.title || '')}`);
                break;
            case 'order':
                router.push(`/admin/orders?search=${item.id}`);
                break;
            case 'repair':
                router.push(`/admin/repairs?search=${item.id}`);
                break;
        }
    };

    return (
        <div className="relative" ref={searchWrapperRef}>
            <div className="flex items-center relative w-80">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Tìm SP, Đơn hàng, Phiếu SC..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowResults(true);
                    }}
                    onFocus={() => { if (query) setShowResults(true); }}
                    className="w-full h-10 pl-10 pr-10 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-shadow"
                />
                <button 
                    onClick={() => setShowScanner(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                    title="Quét mã QR"
                >
                    <QrCode size={18} />
                </button>
            </div>

            {/* Dropdown Results */}
            {showResults && (query.length > 0) && (
                <div className="absolute top-12 left-0 w-[400px] right-auto bg-white rounded-xl shadow-xl border border-gray-100 max-h-96 overflow-y-auto z-50">
                    {isSearching ? (
                        <div className="p-4 flex items-center justify-center text-gray-500">
                            <Loader2 className="animate-spin mr-2" size={18} /> Đang tìm kiếm...
                        </div>
                    ) : results.length > 0 ? (
                        <ul className="py-2">
                            {results.map((item, idx) => (
                                <li 
                                    key={item.id || idx} 
                                    className="px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-orange-50 cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => handleResultClick(item)}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                        {item._type === 'product' && <Package size={18} className="text-blue-500" />}
                                        {item._type === 'service' && <Sparkles size={18} className="text-purple-500" />}
                                        {item._type === 'order' && <ShoppingCart size={18} className="text-green-500" />}
                                        {item._type === 'repair' && <Wrench size={18} className="text-orange-500" />}
                                        {item._type === 'unknown' && <Search size={18} className="text-gray-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {item.name || item.title || `Mã: ${item.id}`}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {item._type === 'order' || item._type === 'repair' 
                                                ? `${item._type === 'order' ? 'Đơn hàng' : 'Phiếu SC'} • Khách: ${item.customer?.name || item.customer?.phone || 'Khách lẻ'}`
                                                : `${item.category || ''} ${item.brand ? `• ${item.brand}` : ''}`
                                            }
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-6 text-center text-gray-500">
                            <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Search size={20} className="text-gray-400" />
                            </div>
                            <p className="text-sm">Không tìm thấy kết quả nào cho &quot;{query}&quot;</p>
                        </div>
                    )}
                </div>
            )}

            {/* QR Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <QrCode size={20} className="text-orange-500"/>
                                Quét mã QR
                            </h3>
                            <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-gray-200 rounded-xl transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="relative aspect-square bg-black">
                            <video ref={videoRef} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 border-[40px] border-black/50">
                                <div className="w-full h-full border-2 border-orange-500 relative rounded-lg">
                                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-orange-500 rounded-tl-lg"></div>
                                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-orange-500 rounded-tr-lg"></div>
                                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-orange-500 rounded-bl-lg"></div>
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-orange-500 rounded-br-lg"></div>
                                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-orange-500/50 shadow-[0_0_8px_2px_rgba(249,115,22,0.5)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                </div>
                            </div>
                        </div>
                        {devices.length > 1 && (
                            <div className="p-4 bg-gray-50 border-t">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Chọn Camera</label>
                                <select 
                                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={selectedDevice}
                                    onChange={e => setSelectedDevice(e.target.value)}
                                >
                                    {devices.map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera ' + d.deviceId}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="p-4 bg-white text-center text-sm text-gray-500">
                            Đưa mã QR của Đơn hàng hoặc Phiếu Sửa Chữa vào khung hình để quét tự động
                        </div>
                    </div>
                </div>
            )}
            
            <style jsx>{`
                @keyframes scan {
                    0% { top: 0; }
                    50% { top: 100%; }
                    100% { top: 0; }
                }
            `}</style>
        </div>
    );
}
