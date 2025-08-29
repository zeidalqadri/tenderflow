module.exports = {
  extends: [
    '../../.eslintrc.js',
    'next/core-web-vitals',
  ],
  env: {
    browser: true,
  },
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
};