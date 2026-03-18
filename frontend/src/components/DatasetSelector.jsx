/**
 * DatasetSelector.jsx
 * -------------------
 * Fetches the brand list from /datasets on mount and renders a dropdown.
 * Calls onSelect(brandId, brandMeta) when the user picks a brand.
 *
 * brandMeta shape: { id, name, vertical, channels, description }
 * channels is the array the rest of the app uses to know which sliders/charts to render.
 */

import { useState, useEffect } from 'react';
import { fetchDatasets } from '../api';

function DatasetSelector({ onSelect, activeBrand }) {
  const [brands, setBrands] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDatasets()
      .then(data => setBrands(data.brands))
      .catch(e => setError(e.message));
  }, []);

  const handleChange = (e) => {
    const brandId = e.target.value;
    const meta = brands.find(b => b.id === brandId);
    if (meta) onSelect(brandId, meta);
  };

  const activeMeta = brands.find(b => b.id === activeBrand);

  if (error) return <div>Error loading brands: {error}</div>;

  return (
    <div>
      <label htmlFor="brand-select">Brand Scenario</label>
      <select id="brand-select" value={activeBrand ?? ''} onChange={handleChange}>
        <option value="" disabled>Select a brand...</option>
        {brands.map(b => (
          <option key={b.id} value={b.id}>
            {b.name} — {b.vertical}
          </option>
        ))}
      </select>

      {activeMeta && (
        <p>{activeMeta.description}</p>
      )}
    </div>
  );
}

export default DatasetSelector;
