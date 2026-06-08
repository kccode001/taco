type IconProps = { size?: number; className?: string };

const base = (size = 18, className = "") => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const HomeIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const UploadIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const UserIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const PlusIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const CloseIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ChevronLeftIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const ChevronRightIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const SearchIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const CheckIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const PencilIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z" />
  </svg>
);

export const CameraIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const PinIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const FileTextIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export const ClockIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const StoreIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h16l-1.2 11.2A2 2 0 0116.8 20H7.2a2 2 0 01-2-1.8L4 7z" />
    <path d="M8 7V5a4 4 0 018 0v2" />
  </svg>
);

export const FilterIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

export const RefreshIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

export const BellIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
