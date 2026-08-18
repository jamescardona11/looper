export type AnimatedTextToken = {
  key: number;
  text: string;
  isWhitespace: boolean;
  delay: number;
};

const animationWindowSeconds = 0.5;
const shortestDelaySeconds = 0.03;
const longestDelaySeconds = 0.12;

export function buildAnimatedTextTokens(
  value: string,
  priorOffsets: ReadonlySet<number>,
): AnimatedTextToken[] {
  let cursor = 0;
  const tokens = value
    .split(/(\s+)/)
    .reduce<Array<AnimatedTextToken & { newlyVisible: boolean }>>(
      (result, text) => {
        if (text.length === 0) return result;
        const key = cursor;
        cursor += text.length;
        const isWhitespace = /^\s+$/.test(text);
        result.push({
          key,
          text,
          isWhitespace,
          delay: 0,
          newlyVisible: !isWhitespace && !priorOffsets.has(key),
        });
        return result;
      },
      [],
    );

  const newlyVisibleCount = tokens.reduce(
    (count, token) => count + Number(token.newlyVisible),
    0,
  );
  const delayStep = Math.min(
    longestDelaySeconds,
    Math.max(shortestDelaySeconds, animationWindowSeconds / newlyVisibleCount),
  );
  let sequence = 0;

  return tokens.map(({ newlyVisible, ...token }) => ({
    ...token,
    delay: newlyVisible ? sequence++ * delayStep : 0,
  }));
}
