import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Matcha Playground — Agent Energy Attribution',
  description: 'See how much energy each step of your AI agent consumes. Swap models, compare costs, optimize your pipeline.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}<Analytics /></body>
    </html>
  );
}
