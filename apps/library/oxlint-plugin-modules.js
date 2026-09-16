const allowedTextUtilities = new Set([
  "text-left",
  "text-center",
  "text-right",
  "text-justify",
  "text-start",
  "text-end",
  "text-wrap",
  "text-nowrap",
  "text-balance",
  "text-pretty",
  "text-ellipsis",
  "text-clip",
]);

function lastBareDelimiterIndex(value, delimiter) {
  let depth = 0;
  let lastIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
    } else if (character === delimiter && depth === 0) {
      lastIndex = index;
    }
  }
  return lastIndex;
}

function classUtility(token) {
  let utility = token;
  if (utility.startsWith("!")) {
    utility = utility.slice(1);
  }
  if (utility.endsWith("!")) {
    utility = utility.slice(0, -1);
  }
  const variantColonIndex = lastBareDelimiterIndex(utility, ":");
  if (variantColonIndex !== -1) {
    utility = utility.slice(variantColonIndex + 1);
  }
  const opacitySlashIndex = lastBareDelimiterIndex(utility, "/");
  if (opacitySlashIndex !== -1) {
    utility = utility.slice(0, opacitySlashIndex);
  }
  return utility;
}

function forbiddenFontClassnames(value) {
  const classnames = [];
  for (const token of value.split(/\s+/)) {
    if (token.length === 0) {
      continue;
    }
    const utility = classUtility(token);
    if (!utility.startsWith("text-")) {
      continue;
    }
    if (allowedTextUtilities.has(utility)) {
      continue;
    }
    if (utility.startsWith("text-shadow")) {
      continue;
    }
    classnames.push(token);
  }
  return classnames;
}

function reportFontClassnames(context, node, value) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  const classnames = forbiddenFontClassnames(value);
  if (classnames.length === 0) {
    return;
  }
  context.report({
    node,
    message: `Font size and font color classnames are not allowed in modules/** (${classnames.join(", ")}). Use Typeset / semantic tags (and brickMutedClass for muted meta).`,
  });
}

const noFontClassnames = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Tailwind font size and font color classnames under modules/**",
    },
  },
  create(context) {
    return {
      Literal(node) {
        reportFontClassnames(context, node, node.value);
      },
      TemplateElement(node) {
        reportFontClassnames(context, node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default {
  meta: {
    name: "modules",
  },
  rules: {
    "no-font-classnames": noFontClassnames,
  },
};
