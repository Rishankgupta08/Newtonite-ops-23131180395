/** Gradient initial avatar used across sidebar, topbar, tables and activity. */
export function Avatar({
  name,
  size = 32,
  className = '',
}: {
  name?: string | null;
  size?: 22 | 24 | 28 | 32 | 34 | 40 | 64;
  className?: string;
}) {
  return (
    <span className={`avatar avatar-${size} ${className}`} title={name ?? undefined}>
      {name?.trim()?.[0]?.toUpperCase() ?? 'U'}
    </span>
  );
}
