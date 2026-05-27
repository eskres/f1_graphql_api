import './global.css';
import { Providers } from './providers';
import { Footer } from '@/components/Footer';
import { Jost } from 'next/font/google';

const jost = Jost({ subsets: ['latin'], variable: '--font-jost' });

export const metadata = {
  title: 'F1 Data Visualiser - BoxBoxBox',
  description: 'Explore Formula 1 race data through interactive charts and visualisations.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏁</text></svg>",
  },
};

export default function RootLayout({children}: {
  children: React.ReactNode;
}) {
  return (
      <html lang="en" className={jost.variable}>
        <body className="max-w-[85%] mx-auto my-10">
          <Providers>{children}</Providers>
          <Footer />
        </body>
      </html>
  );
}