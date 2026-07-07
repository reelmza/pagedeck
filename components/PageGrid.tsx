"use client";

import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import PageCard from "./PageCard";
import type { PageRef } from "@/lib/types";

type Props = {
  pages: PageRef[];
  fileMeta: Map<string, { name: string; color: string }>;
  selected: Set<string>;
  /** Id of the page currently being dragged, if any. */
  activeId: string | null;
  onToggleSelect: (pageId: string, e: React.MouseEvent) => void;
  onCardClick: (pageId: string, e: React.MouseEvent) => void;
};

/** The 4-column sortable grid of page thumbnails. */
export default function PageGrid({
  pages,
  fileMeta,
  selected,
  activeId,
  onToggleSelect,
  onCardClick,
}: Props) {
  return (
    <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-4 gap-4">
        {pages.map((page, index) => (
          <PageCard
            key={page.id}
            page={page}
            index={index}
            fileName={fileMeta.get(page.fileId)?.name ?? ""}
            fileColor={fileMeta.get(page.fileId)?.color ?? "var(--border)"}
            selected={selected.has(page.id)}
            selectionActive={selected.size > 0}
            forceMount={page.id === activeId}
            onToggleSelect={onToggleSelect}
            onClick={onCardClick}
          />
        ))}
      </div>
    </SortableContext>
  );
}
