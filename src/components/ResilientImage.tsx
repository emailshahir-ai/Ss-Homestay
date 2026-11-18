import { useState } from 'react';
import { Home } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  title?: string;
  className?: string;
}

export function ResilientImage({ src, alt, title, className = '' }: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-[#EFF2EE] via-[#E4EAE3] to-[#D6DFD4] flex flex-col items-center justify-center p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="w-12 h-12 rounded-full bg-white/80 text-[#14532D] flex items-center justify-center mb-3 border border-[#DDE2DC]">
          <Home className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-[#161B17]">{title || alt}</p>
        <p className="text-xs text-[#525C54] mt-1">Ss Homestay & Roomstay</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
