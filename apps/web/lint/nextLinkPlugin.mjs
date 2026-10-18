import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const buttonModule = resolve(webRoot, "components/ui/button");

function isNextLinkSource(node) {
  return (
    (node?.type === "Literal" && node.value === "next/link") ||
    (node?.type === "TemplateLiteral" &&
      node.expressions.length === 0 &&
      node.quasis[0].value.cooked === "next/link")
  );
}

export default definePlugin({
  meta: { name: "qrk" },
  rules: {
    "next-link-composition": defineRule({
      meta: {
        type: "problem",
        schema: [],
        messages: {
          composition:
            "Use Wordmark or UnderlinedLink, or place Link directly inside the shared Button with asChild enabled.",
        },
      },
      create(context) {
        const { sourceCode, filename } = context;
        const linkBindings = [];
        const buttonBindings = new Set();

        return {
          ImportDeclaration(node) {
            if (isNextLinkSource(node.source)) {
              const [specifier] = node.specifiers;
              if (
                node.importKind === "type" ||
                node.specifiers.length !== 1 ||
                (specifier.type !== "ImportDefaultSpecifier" &&
                  (specifier.type !== "ImportSpecifier" ||
                    specifier.imported.name !== "default" ||
                    specifier.importKind === "type"))
              ) {
                context.report({ node, messageId: "composition" });
                return;
              }
              linkBindings.push(sourceCode.getDeclaredVariables(specifier)[0]);
              return;
            }

            const source = node.source.value;
            const modulePath = source.startsWith("@/")
              ? resolve(webRoot, source.slice(2))
              : source.startsWith(".")
                ? resolve(dirname(filename), source)
                : null;
            if (
              modulePath?.replace(/\.(?:[cm]?[jt]sx?)$/, "") !== buttonModule ||
              node.importKind === "type"
            )
              return;

            for (const specifier of node.specifiers) {
              if (
                specifier.type === "ImportSpecifier" &&
                specifier.imported.name === "Button" &&
                specifier.importKind !== "type"
              )
                buttonBindings.add(sourceCode.getDeclaredVariables(specifier)[0]);
            }
          },
          "Program:exit"() {
            for (const binding of linkBindings) {
              for (const reference of binding.references) {
                const name = reference.identifier;
                const opening = name.parent;
                if (opening.type === "JSXClosingElement") continue;

                const element = opening.parent;
                const parent = element?.parent;
                const buttonName = parent?.openingElement?.name;
                let buttonBinding;
                if (buttonName?.type === "JSXIdentifier") {
                  let scope = sourceCode.getScope(buttonName);
                  while (scope && !buttonBinding) {
                    buttonBinding = scope.set.get(buttonName.name);
                    scope = scope.upper;
                  }
                }

                let asChild = false;
                if (parent?.type === "JSXElement") {
                  for (const attribute of parent.openingElement.attributes) {
                    if (attribute.type === "JSXSpreadAttribute") asChild = false;
                    else if (attribute.name.name === "asChild")
                      asChild =
                        attribute.value === null ||
                        (attribute.value.type === "JSXExpressionContainer" &&
                          attribute.value.expression.type === "Literal" &&
                          attribute.value.expression.value === true);
                  }
                }

                const children = parent?.children?.filter(
                  (child) =>
                    !(child.type === "JSXText" && child.value.trim() === "") &&
                    !(
                      child.type === "JSXExpressionContainer" &&
                      child.expression.type === "JSXEmptyExpression"
                    ),
                );
                if (
                  opening.type !== "JSXOpeningElement" ||
                  opening.name !== name ||
                  parent?.type !== "JSXElement" ||
                  !buttonBindings.has(buttonBinding) ||
                  !asChild ||
                  children.length !== 1 ||
                  children[0] !== element
                )
                  context.report({ node: name, messageId: "composition" });
              }
            }
          },
          ImportExpression(node) {
            if (isNextLinkSource(node.source)) context.report({ node, messageId: "composition" });
          },
          ExportNamedDeclaration(node) {
            if (isNextLinkSource(node.source)) context.report({ node, messageId: "composition" });
          },
          ExportAllDeclaration(node) {
            if (isNextLinkSource(node.source)) context.report({ node, messageId: "composition" });
          },
          CallExpression(node) {
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "require" &&
              isNextLinkSource(node.arguments[0])
            )
              context.report({ node, messageId: "composition" });
          },
        };
      },
    }),
  },
});
