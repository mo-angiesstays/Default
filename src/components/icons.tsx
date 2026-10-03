/**
 * Line icons, drawn on a 24-grid with a 1.6 stroke.
 *
 * These replace the emoji the first pass used. Emoji render in their own
 * fixed colours — the bright blue of 👥 and 💬 fought the muted palette on
 * every screen — and they sit on the baseline differently across platforms.
 */

type IconProps = { className?: string; size?: number };

function svg(path: React.ReactNode) {
  return function Icon({ className = "", size = 18 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconDashboard = svg(
  <>
    <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
    <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
  </>,
);

export const IconTasks = svg(
  <>
    <path d="M4 7.5 6 9.5 9.5 5.5" />
    <path d="M4 17 6 19l3.5-4" />
    <path d="M13 7.5h7M13 17h7" />
  </>,
);

export const IconCalendar = svg(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);

export const IconIssue = svg(
  <>
    <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
    <path d="M12 10v4M12 17.2v.3" />
  </>,
);

export const IconChat = svg(
  <path d="M20.5 12c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.6-.34L4.5 20.5l1.3-3.5A6.9 6.9 0 0 1 3.5 12c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z" />,
);

export const IconClock = svg(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);

export const IconProperty = svg(
  <>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M5.8 9.8V20h12.4V9.8" />
    <path d="M10 20v-5h4v5" />
  </>,
);

export const IconTeam = svg(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.2 19.5c0-3.1 2.6-5.3 5.8-5.3s5.8 2.2 5.8 5.3" />
    <path d="M16.2 5.2a3.2 3.2 0 0 1 0 6.1M17.6 14.6c2 .7 3.3 2.4 3.3 4.9" />
  </>,
);

export const IconChecklist = svg(
  <>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <path d="M8.2 9.3l1.6 1.6 3.4-3.6M8.2 15.6l1.6 1.6 3.4-3.6" />
    <path d="M16 9h.01M16 15.4h.01" />
  </>,
);

export const IconScheduling = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
  </>,
);

export const IconSettings = svg(
  <>
    <path d="M13.2 2.8 11 11l-6 1.6 5.8 2.2L8.8 21.2 15 13l6-1.6-5.8-2.2 -2-6.4Z" />
  </>,
);

export const IconCamera = svg(
  <>
    <path d="M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5v-8A1.5 1.5 0 0 1 3.5 9Z" />
    <circle cx="12" cy="13.6" r="3.4" />
  </>,
);

export const IconSparkle = svg(
  <>
    <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9 12 3.2Z" />
    <path d="M18.8 3v2.6M20.1 4.3h-2.6" />
  </>,
);

export const IconMenu = svg(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconChevronRight = svg(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />);
