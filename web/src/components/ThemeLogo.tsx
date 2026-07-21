type ThemeLogoProps = {
  className?: string;
  alt: string;
  width: number;
  height: number;
  lightSrc?: string;
  darkSrc?: string;
};

/** Light/dark logo pair switched by `html[data-resolved-theme]`. */
export function ThemeLogo({
  className = "",
  alt,
  width,
  height,
  lightSrc = "/logo-plain.svg",
  darkSrc = "/logo-plain-dark.svg",
}: ThemeLogoProps) {
  return (
    <span className={`theme-logo-wrap ${className}`.trim()}>
      <img
        className="theme-logo-light"
        src={lightSrc}
        alt={alt}
        width={width}
        height={height}
        decoding="async"
      />
      <img
        className="theme-logo-dark"
        src={darkSrc}
        alt=""
        width={width}
        height={height}
        decoding="async"
        aria-hidden="true"
      />
    </span>
  );
}
