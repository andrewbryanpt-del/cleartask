import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const defaults = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconDashboard(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconTasks(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M5 6h.01M5 12h.01M5 18h.01" strokeWidth="2.5" />
    </svg>
  );
}

export function IconMegaphone(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M3 11v2a2 2 0 0 0 2 2h1l6 4V5L6 9H5a2 2 0 0 0-2 2z" />
      <path d="M16 8.5a4 4 0 0 1 0 7" />
    </svg>
  );
}

export function IconTemplate(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
    </svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h.01M9 11h.01M9 15h.01M15 7h.01M15 11h.01M15 15h.01" strokeWidth="2.5" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
