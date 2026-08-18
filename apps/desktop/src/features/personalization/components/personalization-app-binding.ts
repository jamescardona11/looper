type AppBinding = Readonly<{
  name: string;
  identifier?: string | null;
}>;

function canonicalName(name: string) {
  return name.trim().toLowerCase();
}

function canonicalIdentifier(identifier?: string | null) {
  return identifier?.trim().toLowerCase() || null;
}

function bindingKey(app: AppBinding) {
  return canonicalIdentifier(app.identifier) ?? `name:${canonicalName(app.name)}`;
}

function shouldReplaceBinding(existing: AppBinding, candidate: AppBinding) {
  if (bindingKey(existing) === bindingKey(candidate)) return true;

  const upgradesNameOnlyBinding =
    canonicalIdentifier(candidate.identifier) !== null &&
    canonicalIdentifier(existing.identifier) === null;
  return (
    upgradesNameOnlyBinding && canonicalName(existing.name) === canonicalName(candidate.name)
  );
}

export {
  bindingKey as appBindingKey,
  shouldReplaceBinding as shouldReplaceAppBinding,
};
