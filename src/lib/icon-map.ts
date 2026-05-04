'use client';

import type { LucideIcon } from 'lucide-react';
import {
    Smartphone, Wrench, Battery, Monitor, Laptop, Watch, Cpu,
    Headphones, Tablet, Shield, Camera, Wifi, Zap, Package,
    Settings, LayoutGrid, ShoppingBag, Tv, Printer, HardDrive,
    Bluetooth, Speaker, MousePointer, Keyboard, Gamepad2,
} from 'lucide-react';

/**
 * Lookup table: icon name (string stored in Firestore) → Lucide component.
 * Used by Header, HeroSection, Footer to render dynamic navigation icons.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
    Smartphone,
    Wrench,
    Battery,
    Monitor,
    Laptop,
    Watch,
    Cpu,
    Headphones,
    Tablet,
    Shield,
    Camera,
    Wifi,
    Zap,
    Package,
    Settings,
    LayoutGrid,
    ShoppingBag,
    Tv,
    Printer,
    HardDrive,
    Bluetooth,
    Speaker,
    MousePointer,
    Keyboard,
    Gamepad2,
};

/** All available icon names for Admin dropdown */
export const ICON_NAMES = Object.keys(ICON_MAP);

/** Resolve icon name to component with fallback */
export function getIcon(name?: string): LucideIcon {
    if (!name) return LayoutGrid;
    return ICON_MAP[name] || LayoutGrid;
}
