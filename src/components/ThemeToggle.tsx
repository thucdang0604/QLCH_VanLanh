'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

export default function ThemeToggle({ className = '' }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    const nextThemeLabel = isDark ? 'chế độ ngày' : 'chế độ đêm';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`inline-flex items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/50 ${className}`}
            aria-label={`Chuyển sang ${nextThemeLabel}`}
            aria-pressed={isDark}
            title={`Chuyển sang ${nextThemeLabel}`}
        >
            {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
    );
}
