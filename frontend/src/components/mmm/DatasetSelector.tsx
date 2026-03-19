import { useState, useEffect } from 'react';
import { fetchDatasets } from '@/api';
import type { BrandMeta } from '@/data/mockData';
import { ChevronDown } from 'lucide-react';

interface DatasetSelectorProps {
  onSelect: (brandId: string, meta: BrandMeta) => void;
  activeBrand: string | null;
}

export default function DatasetSelector({ onSelect, activeBrand }: DatasetSelectorProps) {
  const [brands, setBrands] = useState<BrandMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDatasets()
      .then(data => setBrands(data.brands))
      .catch(e => setError(e.message));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const brandId = e.target.value;
    const meta = brands.find(b => b.id === brandId);
    if (meta) onSelect(brandId, meta);
  };

  if (error) return <div className="text-destructive text-sm">Error loading brands: {error}</div>;

  return (
    <div className="relative w-full">
      <select
        id="brand-select"
        value={activeBrand ?? ''}
        onChange={handleChange}
        className="appearance-none w-full bg-card border border-border rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
      >
        <option value="" disabled>Select a brand…</option>
        {brands.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}, {b.vertical}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}
