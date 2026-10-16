import React from 'react';

interface TagBadgeProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md';
  onRemove?: () => void;
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  name,
  color = '#6366f1',
  size = 'sm',
  onRemove
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md border transition-all ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      }`}
      style={{
        backgroundColor: `${color}18`,
        borderColor: `${color}40`,
        color: color
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-75 focus:outline-none"
        >
          &times;
        </button>
      )}
    </span>
  );
};
