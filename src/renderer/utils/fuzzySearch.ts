export interface FuzzySearchResult<T> {
  item: T;
  score: number;
  highlights: number[];
}

interface MatchResult {
  score: number;
  highlights: number[];
}

const WORD_BOUNDARY_CHARS = new Set([' ', '-', '_', '.', '/', '\\', ':']);

const clampScore = (score: number): number => {
  if (score < 0) {
    return 0;
  }
  if (score > 1) {
    return 1;
  }
  return score;
};

const findSequentialHighlights = (targetLower: string, queryLower: string): number[] | null => {
  const highlights: number[] = [];
  let queryIndex = 0;

  for (let targetIndex = 0; targetIndex < targetLower.length; targetIndex += 1) {
    if (queryIndex >= queryLower.length) {
      break;
    }

    if (targetLower[targetIndex] === queryLower[queryIndex]) {
      highlights.push(targetIndex);
      queryIndex += 1;
    }
  }

  if (queryIndex !== queryLower.length) {
    return null;
  }

  return highlights;
};

const isWordStart = (target: string, index: number): boolean => {
  if (index === 0) {
    return true;
  }

  const previous = target[index - 1];
  return previous !== undefined && WORD_BOUNDARY_CHARS.has(previous);
};

const scoreMatch = (target: string, query: string): MatchResult | null => {
  const targetNormalized = target.trim();
  const queryNormalized = query.trim();

  if (queryNormalized.length === 0) {
    return { score: 1, highlights: [] };
  }

  if (targetNormalized.length === 0) {
    return null;
  }

  const targetLower = targetNormalized.toLowerCase();
  const queryLower = queryNormalized.toLowerCase();
  const exact = targetLower === queryLower;
  if (exact) {
    return {
      score: 1,
      highlights: queryLower.split('').map((_, index) => index),
    };
  }

  const highlights = findSequentialHighlights(targetLower, queryLower);
  if (!highlights) {
    return null;
  }

  const first = highlights[0] ?? 0;
  const last = highlights[highlights.length - 1] ?? first;
  const span = Math.max(1, last - first + 1);
  const coverage = queryLower.length / targetLower.length;
  const compactness = queryLower.length / span;

  let consecutiveMatches = 1;
  let longestConsecutiveRun = 1;
  for (let index = 1; index < highlights.length; index += 1) {
    const currentHighlight = highlights[index];
    const previousHighlight = highlights[index - 1];
    if (currentHighlight !== undefined && previousHighlight !== undefined && currentHighlight === previousHighlight + 1) {
      consecutiveMatches += 1;
      if (consecutiveMatches > longestConsecutiveRun) {
        longestConsecutiveRun = consecutiveMatches;
      }
    } else {
      consecutiveMatches = 1;
    }
  }

  const wordStartMatches = highlights.filter((index) => isWordStart(targetNormalized, index)).length;
  const consecutiveRatio = longestConsecutiveRun / queryLower.length;
  const wordStartRatio = wordStartMatches / queryLower.length;
  const earlyMatchBonus = 1 - Math.min(1, first / Math.max(1, targetLower.length - 1));

  const score = clampScore(
    (coverage * 0.35)
      + (compactness * 0.25)
      + (consecutiveRatio * 0.2)
      + (wordStartRatio * 0.15)
      + (earlyMatchBonus * 0.05),
  );

  return {
    score,
    highlights,
  };
};

export const fuzzySearch = <T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): FuzzySearchResult<T>[] => {
  const normalizedQuery = query.trim();

  const results: FuzzySearchResult<T>[] = [];
  for (const item of items) {
    const text = getText(item);
    const match = scoreMatch(text, normalizedQuery);
    if (!match) {
      continue;
    }

    results.push({
      item,
      score: match.score,
      highlights: match.highlights,
    });
  }

  return results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const leftText = getText(left.item);
    const rightText = getText(right.item);
    if (leftText.length !== rightText.length) {
      return leftText.length - rightText.length;
    }

    return leftText.localeCompare(rightText);
  });
};
