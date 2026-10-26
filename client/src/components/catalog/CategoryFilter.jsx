// CategoryFilter - Owner: Member 7 - Requirements: 18
// Props: { categories, value, onChange } — value is a category _id ('' = all); onChange(newId)
import FormField from '../common/FormField';

export default function CategoryFilter({ categories = [], value = '', onChange }) {
  return (
    <FormField label="Category">
      <select value={value} onChange={(e) => onChange?.(e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c._id} value={c._id}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
        ))}
      </select>
    </FormField>
  );
}
