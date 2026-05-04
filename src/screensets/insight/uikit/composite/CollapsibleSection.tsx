/**
 * CollapsibleSection — expandable/collapsible section with a trigger row.
 * Uses @hai3/uikit Collapsible (Radix UI) for accessibility and animation.
 * No state imports.
 */

import React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@hai3/uikit';
import useLocalStorage from '../../hooks/useLocalStorage';

export interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  defaultOpen = false,
  storageKey,
  children,
}) => {
  const [open, setOpen] = useLocalStorage(storageKey, defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-start justify-between w-full px-4 py-3 bg-white border-none cursor-pointer text-left hover:bg-black/[0.03] transition-colors"
        >
          <div>
            <span className="text-sm font-semibold text-gray-900">{title}</span>
            {subtitle && (
              <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-500 bg-slate-100 rounded px-1.5 py-px">
              {open ? 'Expanded' : 'Collapsed'}
            </span>
            <span className="text-xs text-gray-500">{open ? '▴' : '▾'}</span>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-gray-200 bg-white">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsibleSection;
