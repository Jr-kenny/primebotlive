import { motion } from "framer-motion";

const Footer = () => {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.8 }}
      className="border-t border-border/50 py-6 px-6 md:px-12"
    >
      <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          Powered by
          <span className="text-foreground/70">OpenGradient</span>
          <span className="text-border">·</span>
          <span className="text-foreground/70">x402</span>
          <span className="text-border">·</span>
          <span className="text-foreground/70">Base</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
          <span className="text-muted-foreground/50">Agent decisions are not financial advice</span>
        </div>
      </div>
    </motion.footer>
  );
};

export default Footer;
