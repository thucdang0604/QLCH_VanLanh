'use client';

import { useCallback } from 'react';

/**
 * Format a number with "." as thousands separator (Vietnamese currency convention).
 * e.g. 1500000 → "1.500.000"
 */
export function formatVND(value: number | string): string {
    const num = typeof value === 'string' ? value.replace(/\./g, '') : String(value);
    const parsed = parseInt(num, 10);
    if (isNaN(parsed) || parsed === 0) return '';
    return parsed.toLocaleString('vi-VN');
}

/** Strip "." separators and return raw number */
export function parseVND(formatted: string): number {
    return parseInt(formatted.replace(/\./g, ''), 10) || 0;
}

interface CurrencyInputProps {
    value: number | '' | string;
    onChange: (numericValue: number) => void;
    onBlur?: () => void;
    className?: string;
    placeholder?: string;
    required?: boolean;
    min?: number;
    id?: string;
    disabled?: boolean;
}

/**
 * A drop-in replacement for `<input type="number">` that displays
 * Vietnamese currency formatting with "." as thousands separator.
 *
 * - Displays: "1.500.000"
 * - Stores: 1500000 (number)
 */
export default function CurrencyInput({
    value,
    onChange,
    onBlur,
    className = '',
    placeholder = '0',
    required,
    min,
    id,
    disabled,
}: CurrencyInputProps) {
    const displayValue = value === '' || value === 0 ? '' : formatVND(value);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            const num = parseInt(raw, 10) || 0;
            if (min !== undefined && num < min) {
                onChange(min);
            } else {
                onChange(num);
            }
        },
        [onChange, min]
    );

    return (
        <input
            type="text"
            inputMode="numeric"
            id={id}
            value={displayValue}
            onChange={handleChange}
            onBlur={onBlur}
            className={className}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
        />
    );
}
