const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: ["dist", "node_modules"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-undef": "off",
      "no-fallthrough": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*", "../../../*"],
              message:
                "Evita imports relativos profundos. Usa aliases (@app, @shared, @entities, @widgets, @pages, @api, @hooks, @test, @components, @features, @theme).",
            },
            {
              group: [
                "./hr-panel",
                "./hr-panel/*",
                "../hr-panel",
                "../hr-panel/*",
                "../../hr-panel",
                "../../hr-panel/*",
                "../../../hr-panel",
                "../../../hr-panel/*",
              ],
              message: "Importa desde widgets/hr-panel (shim oficial).",
            },
            {
              group: [
                "./utils/erp",
                "./utils/erp/*",
                "../utils/erp",
                "../utils/erp/*",
                "../../utils/erp",
                "../../utils/erp/*",
                "../../../utils/erp",
                "../../../utils/erp/*",
              ],
              message: "Importa desde shared/utils/erp (shim oficial).",
            },
            {
              group: [
                "./components/erp",
                "./components/erp/*",
                "../components/erp",
                "../components/erp/*",
                "../../components/erp",
                "../../components/erp/*",
                "../../../components/erp",
                "../../../components/erp/*",
              ],
              message: "Importa desde widgets/erp (shim oficial).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@entities/*", "@widgets/*", "@pages/*"],
              message:
                "shared es capa base: no debe importar entities/widgets/pages.",
            },
          ],
        },
      ],
    },
  },
];
