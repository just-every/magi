import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'Next.js Static Site Template',
    description: 'A lightweight, optimized template for building static websites with Next.js, React, and Tailwind CSS.',
    // Uncomment and customize the following for enhanced SEO
    /*
    openGraph: {
      title: 'Next.js Static Site Template',
      description: 'A lightweight, optimized template for building static websites with Next.js, React, and Tailwind CSS.',
      url: 'https://your-domain.com',
      siteName: 'Site Name',
      images: [
        {
          url: 'https://your-domain.com/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Site preview image',
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Next.js Static Site Template',
      description: 'A lightweight, optimized template for building static websites with Next.js, React, and Tailwind CSS.',
      images: ['https://your-domain.com/twitter-image.jpg'],
    },
    */
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased flex flex-col min-h-screen`}>
                <Header />
                <main className="flex-grow">
                    {children}
                </main>
                <Footer />
            </body>
        </html>
    );
}
