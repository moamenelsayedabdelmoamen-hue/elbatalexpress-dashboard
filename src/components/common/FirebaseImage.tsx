import React, { useState, useEffect } from 'react';
import { resolveStorageImageUrl } from '../../utils/storageUtils';

interface FirebaseImageProps {
  src?: string | null;
  fallbackStoragePaths?: string[];
  alt: string;
  className?: string;
  fallbackContent: React.ReactNode;
  onClick?: () => void;
}

export const FirebaseImage: React.FC<FirebaseImageProps> = ({
  src,
  fallbackStoragePaths,
  alt,
  className = 'w-10 h-10 rounded-xl',
  fallbackContent,
  onClick,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);

    resolveStorageImageUrl(src, fallbackStoragePaths).then((url) => {
      if (isMounted) {
        setResolvedUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src, fallbackStoragePaths?.join('|')]);

  if (!resolvedUrl || hasError) {
    return (
      <div
        onClick={onClick}
        className={`${className} flex items-center justify-center shrink-0 overflow-hidden ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        {fallbackContent}
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      onClick={onClick}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      className={`${className} object-cover shrink-0 ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      }`}
    />
  );
};
