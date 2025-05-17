import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface HeaderProps {
  /**
   * Optional custom classes to apply to the header
   */
  className?: string;
}

/**
 * Site header component with navigation and mobile menu
 */
export default function Header({ className = '' }: HeaderProps) {
  // State to track mobile menu open/closed state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Toggle mobile menu state
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className={`w-full py-4 ${className}`}>
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <Image
            src="/logo.svg"
            alt="Site Logo"
            width={32}
            height={32}
            className="mr-2"
          />
          <span className="text-xl font-semibold">Static Site</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden sm:flex space-x-6">
          <Link href="/" className="hover:text-opacity-80 transition-colors">
            Home
          </Link>
          <Link href="/about" className="hover:text-opacity-80 transition-colors">
            About
          </Link>
          <Link href="/services" className="hover:text-opacity-80 transition-colors">
            Services
          </Link>
          <Link href="/contact" className="hover:text-opacity-80 transition-colors">
            Contact
          </Link>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="sm:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={toggleMobileMenu}
        >
          {mobileMenuOpen ? (
            /* X icon when menu is open */
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            /* Hamburger icon when menu is closed */
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="sm:hidden bg-white dark:bg-gray-900 shadow-lg animate-fadeIn">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-col space-y-4">
              <Link
                href="/"
                className="block py-2 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/about"
                className="block py-2 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link
                href="/services"
                className="block py-2 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Services
              </Link>
              <Link
                href="/contact"
                className="block py-2 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
