/**
 * Hand-drawn icon set. Kept tiny and consistent (1.6px strokes, square caps)
 * so nothing here looks lifted from a generic icon library.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function IconPlay({ size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d="M6.5 4.2 16 10l-9.5 5.8z" />
    </svg>
  );
}

export function IconPause({ size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <rect x="5.5" y="4.5" width="3.4" height="11" rx="0.6" />
      <rect x="11.1" y="4.5" width="3.4" height="11" rx="0.6" />
    </svg>
  );
}

export function IconCheck({ size = 10, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="#06090c"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M2.4 6.3 4.9 8.8 9.6 3.4" />
    </svg>
  );
}

export function IconClose({ size = 11, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

/** Wordmark mark: the rain droplet with the three gauge bars cut out in
 *  negative space — the same silhouette as the app icon, at header size. */
export function IconMark({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 20 22"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      {...rest}
    >
      <path d="M10 2C8.3 6.4 3.5 10.4 3.5 14.5a6.5 6.5 0 0 0 13 0C16.5 10.4 11.7 6.4 10 2ZM6.05 13.25a.85.85 0 0 1 1.7 0v3.9a.85.85 0 0 1-1.7 0ZM9.15 14.25a.85.85 0 0 1 1.7 0v2.9a.85.85 0 0 1-1.7 0ZM12.25 15.25a.85.85 0 0 1 1.7 0v1.9a.85.85 0 0 1-1.7 0Z" />
    </svg>
  );
}
