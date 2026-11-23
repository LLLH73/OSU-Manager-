import { Children, isValidElement, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectFieldProps {
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}

function searchOptionLabel(
  children: ReactNode,
  target: string,
): { matched: boolean; label: string; firstLabel: string } {
  let firstLabel = '';
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) continue;
    if (child.type === 'option') {
      const optVal = child.props.value !== undefined ? String(child.props.value) : '';
      const labelText =
        typeof child.props.children === 'string' || typeof child.props.children === 'number'
          ? String(child.props.children)
          : Children.toArray(child.props.children)
              .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
              .join('');
      if (!firstLabel) firstLabel = labelText;
      if (optVal === target) return { matched: true, label: labelText, firstLabel };
    } else if (child.props.children) {
      const nested = searchOptionLabel(child.props.children, target);
      if (!firstLabel && nested.firstLabel) firstLabel = nested.firstLabel;
      if (nested.matched) return { matched: true, label: nested.label, firstLabel };
    }
  }
  return { matched: false, label: '', firstLabel };
}

export function SelectField({
  value,
  onChange,
  disabled = false,
  className = '',
  title,
  children,
}: SelectFieldProps) {
  const res = searchOptionLabel(children, String(value));
  const selectedLabel = res.matched ? res.label : res.firstLabel;

  return (
    <div
      title={title || selectedLabel}
      className={`field relative flex items-center justify-between gap-2 pr-2.5 ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      } ${className}`}
    >
      <span className="min-w-0 flex-1 truncate text-ink">{selectedLabel}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {children}
      </select>
    </div>
  );
}
