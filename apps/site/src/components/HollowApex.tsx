import type { SVGProps } from 'react';

interface HollowApexProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  decorative?: boolean;
  title?: string;
}

export function HollowApex({
  decorative = true,
  title = 'Clervo Hollow Apex',
  ...props
}: HollowApexProps) {
  return (
    <svg
      {...props}
      viewBox="0 0 40 32"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      data-logo-authority="hollow-apex-v1.0"
      data-logo-implementation="web-v1.3-locked"
    >
      <path d="M-4 18H14" fill="none" stroke="#FF3B30" strokeLinecap="round" strokeWidth="1.45" />
      <path d="M14 18H26" fill="none" stroke="#00E5FF" strokeLinecap="round" strokeWidth="1.45" />
      <path d="M26 18H44" fill="none" stroke="#FFC800" strokeLinecap="round" strokeWidth="1.45" />
      <path
        d="M20 2 38 30H2L20 2Zm0 7.1L8.7 26h22.6L20 9.1Z"
        fill="#F5F5F5"
        fillRule="evenodd"
      />
    </svg>
  );
}
