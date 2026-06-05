import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      ".firebase/**",
      ".ai_cache/**",
      "scratch/**",
      "firebase-debug.log",
      "firestore-debug.log",
      "next-env.d.ts",
      "roadmap_v2/**",
    ],
  }
];

export default eslintConfig;
