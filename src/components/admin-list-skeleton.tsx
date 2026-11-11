import { VCard, vcolors as c } from "@/components/ui/vault";

export function AdminListSkeleton() {
  return (
    <div role="status" aria-label="Loading records" aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {[0, 1, 2].map(index => (
        <VCard key={index} className="p-4 space-y-3 motion-safe:animate-pulse">
          <div className="h-4 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
          <div className="h-3 w-1/2 rounded" style={{ backgroundColor: c.fill }} />
          <div className="h-24 rounded-xl" style={{ backgroundColor: c.fill }} />
        </VCard>
      ))}
    </div>
  );
}
