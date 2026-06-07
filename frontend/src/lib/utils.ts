import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-CO').format(num);
}

export function formatReading(num: number | null | undefined): string {
  const value = Number(num ?? 0);
  const hasDecimals = !Number.isInteger(value);
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatKwh(num: number | null | undefined): string {
  return formatReading(num);
}

export function formatReadingInputValue(num: number | null | undefined): string {
  if (num === null || num === undefined) return '';
  const value = Number(num);
  if (Number.isNaN(value)) return '';
  if (Number.isInteger(value)) return String(value);
  const decimalCount = String(value).split('.')[1]?.length ?? 0;
  return decimalCount < 2 ? value.toFixed(2) : String(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getMonthName(mes: number): string {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return meses[mes - 1] || '';
}

export function getCurrentPeriod(): { ano: number; mes: number } {
  const now = new Date();
  return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
}

export function generateOfflineId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
