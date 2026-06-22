export function Logo({
  variant = "light",
  compact = false,
}: {
  /** light = white text on navy sidebar; dark = navy on white backgrounds */
  variant?: "light" | "dark";
  compact?: boolean;
}) {
  return (
    <div className={`logo logo-${variant}${compact ? " logo-compact" : ""}`} aria-label="ClearTask">
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M9 12.5L11 14.5L15.5 10"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="logo-wordmark">
          Clear<span className="logo-accent">Task</span>
        </span>
      )}
    </div>
  );
}
