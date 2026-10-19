import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const parentModules = new Map([
  [resolve(webRoot, "components/ui/button"), "Button"],
  [resolve(webRoot, "components/UnderlinedLink"), "UnderlinedLink"],
]);

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
            "Place Link directly inside Button or UnderlinedLink with asChild enabled.",
        },
      },
      create(context) {
        const { sourceCode, filename } = context;
        const linkBindings = [];
        const parentBindings = new Set();

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
            const exportName = parentModules.get(modulePath?.replace(/\.(?:[cm]?[jt]sx?)$/, ""));
            if (exportName === undefined || node.importKind === "type") return;

            for (const specifier of node.specifiers) {
              if (
                specifier.type === "ImportSpecifier" &&
                specifier.imported.name === exportName &&
                specifier.importKind !== "type"
              )
                parentBindings.add(sourceCode.getDeclaredVariables(specifier)[0]);
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
                const parentName = parent?.openingElement?.name;
                let parentBinding;
                if (parentName?.type === "JSXIdentifier") {
                  let scope = sourceCode.getScope(parentName);
                  while (scope && !parentBinding) {
                    parentBinding = scope.set.get(parentName.name);
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
                  !parentBindings.has(parentBinding) ||
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
