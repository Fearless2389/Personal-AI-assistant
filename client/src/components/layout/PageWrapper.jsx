import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';

export function PageWrapper({ children, className, fullBleed = false }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        fullBleed ? 'h-[calc(100dvh-3.5rem)]' : 'px-4 md:px-6 py-5 md:py-8 max-w-7xl mx-auto w-full pb-24 md:pb-10',
        className
      )}
    >
      {children}
    </motion.main>
  );
}

export default PageWrapper;
