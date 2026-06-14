import { motion } from "framer-motion";

interface StaggerListProps {
  stagger?: number;
  className?: string;
  children: React.ReactNode;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
} as const;

export function StaggerList({
  stagger = 0.06,
  className,
  children,
}: StaggerListProps) {
  return (
    <motion.div
      className={className}
      variants={{
        ...containerVariants,
        show: {
          ...containerVariants.show,
          transition: { staggerChildren: stagger },
        },
      }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

// Export item wrapper for use inside StaggerList
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
