export default function BrandMark({ className = "", size = 30, label = "" }) {
  return (
    <span className={`mv-brand-mark ${className}`.trim()} style={{ "--brand-size": `${size}px` }}>
      <img src="/manshverse-logo.svg" alt={label} />
    </span>
  );
}
