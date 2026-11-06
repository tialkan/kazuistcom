/**
 * Right and wrong marks. They are shapes with a text label next to them, so the result never depends on color
 * (FR-58): a check inside a solid circle for right, a cross inside a dashed square for wrong.
 */
export function DogruIsareti() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path
        d="M5.5 10.5 8.6 13.5 14.6 6.8"
        fill="none"
        stroke="var(--kz-color-surface)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function YanlisIsareti() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <rect
        x="1.5"
        y="1.5"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="3 2.2"
      />
      <path
        d="M6.2 6.2 13.8 13.8M13.8 6.2 6.2 13.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SeciliIsareti() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="4" fill="currentColor" />
    </svg>
  );
}
