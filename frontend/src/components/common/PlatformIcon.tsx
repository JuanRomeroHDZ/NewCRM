import React, { useState } from 'react';

interface PlatformIconProps {
  name: string;
  iconUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({
  name,
  iconUrl,
  size = 'md',
  className = ''
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs rounded-md',
    md: 'w-8 h-8 text-xs rounded-lg',
    lg: 'w-10 h-10 text-sm rounded-xl',
    xl: 'w-12 h-12 text-base rounded-xl',
  };

  const getInitials = (str: string) => {
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  if (iconUrl && !imgError) {
    return (
      <div className={`relative flex-shrink-0 bg-obsidian-surface border border-obsidian-border overflow-hidden flex items-center justify-center p-1 ${sizeClasses[size]} ${className}`}>
        <img
          src={iconUrl}
          alt={name}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex-shrink-0 bg-obsidian-surface border border-obsidian-border flex items-center justify-center font-bold text-obsidian-text tracking-wider select-none ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name || 'PL')}
    </div>
  );
};
