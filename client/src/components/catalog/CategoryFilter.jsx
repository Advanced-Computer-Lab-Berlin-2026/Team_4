// CategoryFilter - Owner: Member 7 - Requirements: 18
// Props: { categories, value, onChange } — value is a category _id or slug ('' = all); onChange(newId)
import FormField from '../common/FormField';

export default function CategoryFilter({ categories = [], value = '', onChange }) {
  const normalizedValue = value.trim().toLowerCase();
  const selectedCategory = categories.find((c) =>
    c._id.toLowerCase() === normalizedValue || c.slug.toLowerCase() === normalizedValue
  );
  const selectedValue = selectedCategory?._id || value;

  return (
    <FormField label="Category">
      <select value={selectedValue} onChange={(e) => onChange?.(e.target.value)}>
        <option value="">All categories</option>
        {value && !selectedCategory && <option value={value} disabled>Unavailable category</option>}
        {categories.map((c) => (
          <option key={c._id} value={c._id}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
        ))}
      </select>
    </FormField>
  );
}
