import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "bin/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
);
