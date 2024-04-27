import React, { useState } from 'react';

interface MultiSelectDropdownProps {
  options: { label: string; value: string }[];
  onChange: (selectedOptions: string[]) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ options, onChange }) => {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions, option => option.value);
    setSelectedOptions(values);
    onChange(values);
  };

  return (
    <select
    className='text-black border-2 border-sky-700 rounded-md p-2 m-2'
     multiple value={selectedOptions} onChange={handleChange}>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default MultiSelectDropdown;
