import React from 'react';
import { X } from 'lucide-react';

interface TagBadgeProps {
  name: string;
  size?: 'sm' | 'md';
  onRemove?: () => void;
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  name,
  size = 'sm',
  onRemove
}) => {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border border-obsidian-border bg-obsidian-surface font-medium text-obsidian-muted ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {name}
      {onRemove && (
        /* [Icono] Quitar la etiqueta elegida. */
        <button
          type="button"
          aria-label={`Quitar etiqueta ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ui-action-icon ml-1"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </span>
  );
};
