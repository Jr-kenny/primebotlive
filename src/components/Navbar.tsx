import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 border-b border-border/50 bg-background/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <span className="font-serif text-xl tracking-tight text-foreground">PRIMEBOT</span>
        <span className="text-muted-foreground text-xs font-mono">v0.1</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden md:inline text-xs font-mono text-muted-foreground">Base Sepolia</span>
        <div className="hidden md:block h-4 w-px bg-border" />
        <Button variant="outline" size="sm" className="font-mono text-xs">
          Connect Wallet
        </Button>
      </div>
    </motion.nav>
  );
};

export default Navbar;
