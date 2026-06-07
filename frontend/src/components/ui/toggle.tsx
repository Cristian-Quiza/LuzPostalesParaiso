import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  activeColor?: string;
  inactiveColor?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  activeColor = 'bg-green-500',
  inactiveColor = 'bg-slate-600',
}: ToggleProps) {
  const sizes = {
    sm: {
      track: 'w-8 h-4',
      thumb: 'w-3 h-3',
      translate: 'translate-x-4',
      icon: 'h-2 w-2',
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-5 h-5',
      translate: 'translate-x-5',
      icon: 'h-3 w-3',
    },
    lg: {
      track: 'w-14 h-7',
      thumb: 'w-6 h-6',
      translate: 'translate-x-7',
      icon: 'h-4 w-4',
    },
  };

  const currentSize = sizes[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
        currentSize.track,
        checked ? activeColor : inactiveColor,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out',
          currentSize.thumb,
          checked ? currentSize.translate : 'translate-x-0.5',
          'mt-0.5'
        )}
      >
        <span
          className={cn(
            'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity duration-200',
            checked ? 'opacity-100' : 'opacity-0'
          )}
        >
          <svg
            className={cn(currentSize.icon, 'text-green-500')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </span>
        <span
          className={cn(
            'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity duration-200',
            checked ? 'opacity-0' : 'opacity-100'
          )}
        >
          <svg
            className={cn(currentSize.icon, 'text-slate-400')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 12H4"
            />
          </svg>
        </span>
      </span>
    </button>
  );
}

interface ToggleCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'alumbrado' | 'seguridad';
}

export function ToggleCard({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
  variant = 'default',
}: ToggleCardProps) {
  const variantStyles = {
    default: {
      active: 'border-green-500 bg-green-500/10',
      icon: 'text-green-500',
    },
    alumbrado: {
      active: 'border-yellow-500/50 bg-yellow-500/10',
      icon: 'text-yellow-400',
    },
    seguridad: {
      active: 'border-blue-500/50 bg-blue-500/10',
      icon: 'text-blue-400',
    },
  };

  const currentVariant = variantStyles[variant];

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 w-full text-left',
        checked ? currentVariant.active : 'border-white/10 bg-white/5 hover:bg-white/10',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div
        className={cn(
          'p-3 rounded-xl transition-colors duration-200',
          checked ? 'bg-white/20' : 'bg-white/5'
        )}
      >
        {icon && (
          <span className={cn('transition-colors duration-200', checked && currentVariant.icon)}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{label}</p>
        {description && (
          <p className="text-sm text-white/50">{description}</p>
        )}
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        activeColor={variant === 'alumbrado' ? 'bg-yellow-500' : variant === 'seguridad' ? 'bg-blue-500' : 'bg-green-500'}
      />
    </button>
  );
}
