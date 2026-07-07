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
  onRemovePage: (pageId: string) => void;
};

/** The sortable grid of page thumbnails — 2 columns on mobile, 4 on md+. */
export default function PageGrid({
  pages,
  fileMeta,
  selected,
  activeId,
  onToggleSelect,
  onCardClick,
  onRemovePage,
}: Props) {
  return (
    <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
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
            onRemove={onRemovePage}
          />
        ))}
      </div>
    </SortableContext>
  );
}
