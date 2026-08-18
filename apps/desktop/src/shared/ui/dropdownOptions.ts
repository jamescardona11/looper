import type { DropdownOption, DropdownValue } from "./dropdownTypes";

function optionMatches<T extends DropdownValue>(
  option: DropdownOption<T>,
  query: string,
) {
  return (
    option.label.toLowerCase().includes(query) ||
    Boolean(option.description?.toLowerCase().includes(query))
  );
}

export function filterDropdownOptions<T extends DropdownValue>(
  options: DropdownOption<T>[],
  searchQuery: string,
) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return options;

  return options.filter((option, index) => {
    if (!option.isHeader) return optionMatches(option, query);

    for (
      let childIndex = index + 1;
      childIndex < options.length;
      childIndex += 1
    ) {
      const child = options[childIndex];
      if (!child || child.isHeader) break;
      if (optionMatches(child, query)) return true;
    }
    return false;
  });
}

export function widestButtonLabels<T extends DropdownValue>(
  options: DropdownOption<T>[],
  placeholder: string,
  includePlaceholder: boolean,
) {
  return [
    ...options
      .filter((option) => !option.isHeader)
      .map((option) => option.label),
    ...(includePlaceholder ? [placeholder] : []),
  ];
}
