"use client";

// Dependency-free markdown renderer covering the subset Claude digests produce:
// headings, paragraphs, bold/italic inline, bullet + ordered lists, blockquotes.
// No HTML pass-through; safe by construction.

import { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        nodes.push(
          <strong key={key++} className="font-semibold text-[#1A1A1A]">
            {text.slice(i + 2, end)}
          </strong>
        );
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" || text[i] === "_") {
      const ch = text[i];
      const end = text.indexOf(ch, i + 1);
      if (end > -1) {
        nodes.push(
          <em key={key++} className="italic">
            {text.slice(i + 1, end)}
          </em>
        );
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        nodes.push(
          <code
            key={key++}
            className="px-1 py-0.5 rounded bg-[#F0F0F0] text-[13px] font-mono"
          >
            {text.slice(i + 1, end)}
          </code>
        );
        i = end + 1;
        continue;
      }
    }
    let next = text.length;
    for (const m of ["**", "*", "_", "`"]) {
      const p = text.indexOf(m, i);
      if (p > -1 && p < next) next = p;
    }
    nodes.push(text.slice(i, next));
    i = next;
  }
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    blocks.push(
      <p key={key++} className="text-[15px] text-[#1A1A1A] leading-[1.65] mb-3">
        {renderInline(buf.join(" "))}
      </p>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const hMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const sizes = ["text-[18px]", "text-[16px]", "text-[15px]", "text-[14px]", "text-[14px]", "text-[14px]"];
      blocks.push(
        <div
          key={key++}
          className={`${sizes[level - 1]} font-semibold text-[#1A1A1A] mt-4 mb-2`}
        >
          {renderInline(text)}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote (used by Claude to highlight recommended action)
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 px-4 py-3 rounded-lg bg-[#FFF5E6] border-l-[3px] border-[#E07B00] text-[15px] text-[#1A1A1A] leading-[1.6]"
        >
          {renderInline(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={key++}
          className="list-disc pl-5 mb-3 text-[15px] text-[#1A1A1A] leading-[1.65] space-y-1"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={key++}
          className="list-decimal pl-5 mb-3 text-[15px] text-[#1A1A1A] leading-[1.65] space-y-1"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph — gather contiguous non-blank lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ")
    ) {
      para.push(lines[i]);
      i++;
    }
    flushParagraph(para);
  }

  return <div>{blocks}</div>;
}
