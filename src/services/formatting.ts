/**
 * Format a PIN code to a 6-digit string with leading zeros
 */
export function formatPin(pin: number): string {
    return pin.toString().padStart(6, "0");
}

/**
 * Format bytes to human-readable size with appropriate unit
 */
export function formatBytesToHumanReadable(bytes: number): string {
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 B";

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);

    return `${size.toFixed(i > 0 ? 2 : 0)} ${sizes[i]}`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(current / total, 1.0);
}
