import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

interface NavbarProps {
  showBack?: boolean;
  onBack?: () => void;
}

const Navbar = ({ showBack, onBack }: NavbarProps) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 border-b border-border/50 bg-background/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <span className="font-serif text-xl tracking-tight text-foreground">PRIMEBOT</span>
        <span className="text-muted-foreground text-xs font-mono">v0.1</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-xs font-mono text-muted-foreground">Base Sepolia</span>
        <div className="hidden md:block h-4 w-px bg-border" />
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <Button variant="outline" size="sm" className="font-mono text-xs">
          Connect Wallet
        </Button>
      </div>
    </motion.nav>
  );
};

export default Navbar;
