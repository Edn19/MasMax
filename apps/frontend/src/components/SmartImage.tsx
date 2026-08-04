import { ImgHTMLAttributes, useState } from 'react';

const fallback = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"%3E%3Crect width="640" height="360" fill="%23111827"/%3E%3Cpath d="M272 122h96v116h-96z" fill="none" stroke="%23475569" stroke-width="8"/%3E%3Cpath d="m294 209 24-28 20 20 14-16 16 24" fill="none" stroke="%23475569" stroke-width="8"/%3E%3Ccircle cx="303" cy="153" r="10" fill="%23475569"/%3E%3C/svg%3E';

export function SmartImage({ src, alt, loading = 'lazy', decoding = 'async', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  return <img {...props} src={failed || !src ? fallback : src} alt={alt ?? ''} loading={loading} decoding={decoding} onError={() => setFailed(true)} />;
}
