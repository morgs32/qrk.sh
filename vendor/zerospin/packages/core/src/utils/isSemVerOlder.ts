const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Compare numeric major/minor/patch only; suffixes do not establish a newer version. */
export const isSemVerOlder = (left: string, right: string): boolean => {
  const leftMatch = semVerPattern.exec(left);
  const rightMatch = semVerPattern.exec(right);
  if (leftMatch === null || rightMatch === null) {
    return false;
  }
  const leftParts = [
    Number(leftMatch[1]),
    Number(leftMatch[2]),
    Number(leftMatch[3]),
  ];
  const rightParts = [
    Number(rightMatch[1]),
    Number(rightMatch[2]),
    Number(rightMatch[3]),
  ];
  for (const index of [0, 1, 2]) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) {
      return false;
    }
    if (leftPart < rightPart) {
      return true;
    }
    if (leftPart > rightPart) {
      return false;
    }
  }
  return false;
};
