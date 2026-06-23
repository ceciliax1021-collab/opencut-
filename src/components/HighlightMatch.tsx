import React from 'react';

interface HighlightMatchProps {
  text: string;
  query: string;
  className?: string;
}

export function HighlightMatch({ text, query, className = '' }: HighlightMatchProps) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <span className={className}>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let index = lowerText.indexOf(lowerQuery, start);

  while (index !== -1) {
    if (index > start) {
      parts.push(text.slice(start, index));
    }
    parts.push(
      <mark
        key={`${index}-${start}`}
        className="bg-amber-200/90 text-[#191919] rounded-sm px-0.5 font-semibold not-italic"
      >
        {text.slice(index, index + trimmed.length)}
      </mark>,
    );
    start = index + trimmed.length;
    index = lowerText.indexOf(lowerQuery, start);
  }

  if (start < text.length) {
    parts.push(text.slice(start));
  }

  return <span className={className}>{parts}</span>;
}
