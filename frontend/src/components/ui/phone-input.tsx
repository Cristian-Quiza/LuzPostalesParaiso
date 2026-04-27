import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

const COUNTRY_CODES = [
  { code: '+57', country: 'Colombia' },
  { code: '+1', country: 'EE.UU./Canadá' },
  { code: '+34', country: 'España' },
  { code: '+44', country: 'Reino Unido' },
  { code: '+52', country: 'México' },
  { code: '+54', country: 'Argentina' },
  { code: '+55', country: 'Brasil' },
  { code: '+51', country: 'Perú' },
  { code: '+58', country: 'Venezuela' },
  { code: '+593', country: 'Ecuador' },
];

export function PhoneInput({
  value,
  onChange,
  label,
  placeholder = "300 123 4567",
  disabled = false,
  error
}: PhoneInputProps) {
  const [selectedCode, setSelectedCode] = useState('+57');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleCodeChange = useCallback((code: string) => {
    setSelectedCode(code);
    if (phoneNumber) {
      onChange(`${code} ${phoneNumber}`);
    }
  }, [phoneNumber, onChange]);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, '');
    setPhoneNumber(input);
    if (input) {
      onChange(`${selectedCode} ${input}`);
    } else {
      onChange('');
    }
  }, [selectedCode, onChange]);

  const isValidPhone = useCallback((phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }, []);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="flex gap-2">
        <select
          value={selectedCode}
          onChange={(e) => handleCodeChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive"
          )}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} ({c.country})
            </option>
          ))}
        </select>
        <Input
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1",
            error && "border-destructive",
            value && !isValidPhone(value) && "border-warning"
          )}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {value && !isValidPhone(value) && !error && (
        <p className="text-sm text-warning">Número de teléfono incompleto</p>
      )}
    </div>
  );
}