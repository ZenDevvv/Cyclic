import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none transition-[background-color,color,scale] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 h-11 sm:h-9 px-4 text-body';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-muted',
  secondary: 'bg-raised text-ink hover:bg-active',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'text-negative hover:bg-negative-bg',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', extra = '') => `${base} ${variants[variant]} ${extra}`;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  busy?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', icon, busy, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'secondary', icon, className = '', children, ...rest }: LinkProps & { variant?: ButtonVariant; icon?: IconName }) {
  return (
    <Link className={buttonClass(variant, className)} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  active,
  ...rest
}: { icon: IconName; label: string; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 sm:size-9 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-40 ${active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
