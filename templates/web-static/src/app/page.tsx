export default function Home() {
    return (
        <div className="w-full">
            {/* Hero Section */}
            <section className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 text-center">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-4xl md:text-6xl font-bold mb-6">
                        Welcome to your Next.js Static Site
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                        A lightweight, optimized template for building blazing-fast static websites.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a
                            href="#features"
                            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Get Started
                        </a>
                        <a
                            href="https://nextjs.org/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Learn More
                        </a>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-16 px-4 bg-white dark:bg-gray-950">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="p-6 border border-gray-100 dark:border-gray-800 rounded-xl">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2">Fast Performance</h3>
                            <p className="text-gray-600 dark:text-gray-300">
                                Optimized build process for minimal bundle size and lightning-fast load times.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="p-6 border border-gray-100 dark:border-gray-800 rounded-xl">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2">SEO Friendly</h3>
                            <p className="text-gray-600 dark:text-gray-300">
                                Structured for better search engine performance with all the metadata you need.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="p-6 border border-gray-100 dark:border-gray-800 rounded-xl">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-purple-600 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2">Modern Design</h3>
                            <p className="text-gray-600 dark:text-gray-300">
                                Clean, responsive layouts with dark/light mode and consistent theming.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 px-4 bg-blue-600 dark:bg-blue-800 text-white">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-6">Ready to Build Your Static Site?</h2>
                    <p className="text-xl mb-8">
                        Get started with this template and create your next project with ease.
                    </p>
                    <a
                        href="https://github.com/your-repo/next-static-template"
                        className="inline-block px-8 py-4 bg-white text-blue-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Get the Template
                    </a>
                </div>
            </section>
        </div>
    );
}
