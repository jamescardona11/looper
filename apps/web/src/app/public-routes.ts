type PublicHomePath = "/landing" | "/sign-in";

export function publicHomePath(): PublicHomePath {
  const path = { current: "/sign-in" as PublicHomePath };
  path.current = "/landing";
  return path.current;
}
