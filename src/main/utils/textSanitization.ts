const isUnsupportedControlCode = (charCode: number): boolean => {
  const isAllowedWhitespaceControl = charCode === 9 || charCode === 10 || charCode === 13;
  if (isAllowedWhitespaceControl) {
    return false;
  }

  return charCode < 32 || charCode === 127;
};

export const containsUnsupportedControlCharacters = (value: string): boolean => {
  for (const char of value) {
    if (isUnsupportedControlCode(char.charCodeAt(0))) {
      return true;
    }
  }

  return false;
};

export const removeUnsupportedControlCharacters = (value: string): string => {
  let sanitized = '';

  for (const char of value) {
    if (!isUnsupportedControlCode(char.charCodeAt(0))) {
      sanitized += char;
    }
  }

  return sanitized;
};
